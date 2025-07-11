# App Authentication

Authorize the calling client app with the TLP Services.

**Endpoint** URL: https://tlpapps.theleadingpractice.com/api/auth

## Login Procedure

Method POST

```json
{
  location: string,
  secret: string
}
```

### Successful Login Response

Status: `200`

Body:

```json
{
  token: string,
  lastRequestDate: string,
  config: {
    LastRun: string,
    DBProvider: string,
    TokenRefresMilliseconds: number,
    AuthEndpoint: string,
    NotificationEndpoint: string,
    PatientEndpoint: string,
    AppointmentEndpoint: string,
    ConnectionString: string,
    RepeatMilliseconds: number,
    MaxBatchSize: number,
    Tables: [
      {
        Name: string,
        UniqueField: string,
        SqlQuery: string,
      }
    ]
  }
}
```

The auth token will expire. The client should use the `config.TokenRefreshMilliseconds` parameter to determine when a new login request should be sent to refresh the token.

### Failed Login or Auth Response

Status: `400, 401, 403`

Body:

```json
{
  message: string
}
```
