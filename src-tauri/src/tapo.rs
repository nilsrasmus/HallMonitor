use crate::settings::CameraConfig;
use crate::tapo_camera::{PrivacyMode, TapoCamera, TapoError as CameraError};
use std::collections::HashMap;
use thiserror::Error;
use tokio::sync::Mutex;

#[derive(Debug, Error)]
pub enum TapoError {
    #[error("Tapo API error: {0}")]
    Api(#[from] tapo::Error),
    #[error("Camera error: {0}")]
    Camera(#[from] CameraError),
    #[error("{0}")]
    Message(String),
}

struct CameraSession {
    username: String,
    password: String,
    camera: TapoCamera,
}

pub struct TapoClient {
    sessions: Mutex<HashMap<String, CameraSession>>,
}

impl TapoClient {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    fn credential_sets(cam: &CameraConfig) -> Vec<(String, String)> {
        let mut sets = Vec::new();
        if !cam.username.is_empty() && !cam.password.is_empty() {
            sets.push((cam.username.clone(), cam.password.clone()));
        }
        if !cam.cloud_password.is_empty() {
            if !cam.username.is_empty() {
                sets.push((cam.username.clone(), cam.cloud_password.clone()));
            }
            sets.push(("admin".to_string(), cam.cloud_password.clone()));
        }
        sets
    }

    fn session_matches_camera(cam: &CameraConfig, session: &CameraSession) -> bool {
        Self::credential_sets(cam)
            .iter()
            .any(|(u, p)| session.username == *u && session.password == *p)
    }

    async fn login_camera(
        ip: &str,
        username: &str,
        password: &str,
    ) -> Result<TapoCamera, CameraError> {
        let mut camera = TapoCamera::new(ip, username, password)
            .map_err(|e| CameraError::Auth(e.to_string()))?;
        camera.login().await?;
        Ok(camera)
    }

    async fn ensure_session(&self, cam: &CameraConfig) -> Result<(), TapoError> {
        {
            let guard = self.sessions.lock().await;
            if let Some(session) = guard.get(&cam.id) {
                if Self::session_matches_camera(cam, session) {
                    return Ok(());
                }
            }
        }

        let mut last_err = TapoError::Message(format!(
            "Could not authenticate with camera at {}",
            cam.ip
        ));
        for (username, password) in Self::credential_sets(cam) {
            match Self::login_camera(&cam.ip, &username, &password).await {
                Ok(camera) => {
                    self.sessions.lock().await.insert(
                        cam.id.clone(),
                        CameraSession {
                            username,
                            password,
                            camera,
                        },
                    );
                    return Ok(());
                }
                Err(e) => last_err = TapoError::Camera(e),
            }
        }

        Err(last_err)
    }

    async fn with_session<F, T>(&self, cam: &CameraConfig, op: F) -> Result<T, TapoError>
    where
        F: for<'a> FnOnce(&'a TapoCamera) -> std::pin::Pin<
            Box<dyn std::future::Future<Output = Result<T, CameraError>> + Send + 'a>,
        >,
    {
        self.ensure_session(cam).await?;

        let result = {
            let guard = self.sessions.lock().await;
            let session = guard
                .get(&cam.id)
                .ok_or_else(|| TapoError::Message("Session missing".into()))?;
            op(&session.camera).await
        };

        match result {
            Ok(v) => Ok(v),
            Err(e) => {
                self.sessions.lock().await.remove(&cam.id);
                Err(TapoError::Camera(e))
            }
        }
    }

    async fn try_tapo_crate_ptz(
        cam: &CameraConfig,
        pan: i32,
        tilt: i32,
    ) -> Result<(), TapoError> {
        let mut last_err = None;
        for (username, password) in Self::credential_sets(cam) {
            let api = tapo::ApiClient::new(&username, &password);
            if let Ok(handler) = api.c210(&cam.ip).await {
                match handler.pan_tilt(pan, tilt).await {
                    Ok(()) => return Ok(()),
                    Err(e) => last_err = Some(TapoError::Api(e)),
                }
            }
            let api = tapo::ApiClient::new(&username, &password);
            if let Ok(handler) = api.c220(&cam.ip).await {
                match handler.pan_tilt(pan, tilt).await {
                    Ok(()) => return Ok(()),
                    Err(e) => last_err = Some(TapoError::Api(e)),
                }
            }
        }
        Err(last_err.unwrap_or_else(|| {
            TapoError::Message(format!(
                "Could not connect to camera at {} for pan/tilt",
                cam.ip
            ))
        }))
    }

    pub async fn move_motor(&self, cam: &CameraConfig, x: i32, y: i32) -> Result<(), TapoError> {
        if x == 0 && y == 0 {
            return Ok(());
        }

        let pan = if x == 0 { 0 } else { x.signum() * 10 };
        let tilt = if y == 0 { 0 } else { -y * 10 };

        let primary = self
            .with_session(cam, |camera| {
                Box::pin(async move { camera.move_motor(pan, tilt).await.map(|_| ()) })
            })
            .await;

        if primary.is_ok() {
            return Ok(());
        }

        if Self::try_tapo_crate_ptz(cam, pan, tilt).await.is_ok() {
            return Ok(());
        }

        primary
    }

    pub async fn stop_motor(&self, _cam: &CameraConfig) -> Result<(), TapoError> {
        Ok(())
    }

    pub async fn get_privacy_mode(&self, cam: &CameraConfig) -> Result<bool, TapoError> {
        self.with_session(cam, |camera| {
            Box::pin(async move {
                camera
                    .get_privacy_mode()
                    .await
                    .map(|mode| mode == PrivacyMode::On)
            })
        })
        .await
    }

    pub async fn set_privacy_mode(
        &self,
        cam: &CameraConfig,
        enabled: bool,
    ) -> Result<(), TapoError> {
        let mode = if enabled {
            PrivacyMode::On
        } else {
            PrivacyMode::Off
        };

        self.with_session(cam, |camera| {
            Box::pin(async move { camera.set_privacy_mode(mode).await })
        })
        .await
    }

    pub async fn test_connection(&self, cam: &CameraConfig) -> Result<String, TapoError> {
        self.ensure_session(cam).await?;
        Ok("Connected".to_string())
    }
}
