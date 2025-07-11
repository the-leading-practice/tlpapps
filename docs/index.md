# TLP Apps Services API

Last update: 2025-07-02

This documentation will help integrators communicate with TLP Apps Services.

The services were designed to keep messaging as simple as possible while still offering functionality and maintaining security. Some enpoints are still in development and as such the control data may change.

During development, the team has made every effort to follow REST*ful* best practices throughout and standardize data. However, when cases are identified where improvements are necessary - they will be documented and corrected to improve stability, maintainability, and developer experience.

## Messaging Standards

### Headers

Before communicating with the service endpoints, the client must be authorized. The authorization is done through the authentication endpoint. The authorization will consist of a location id and generated secret. These will be provided by the TLP Team.

After authentication each call to the TLP Apps Services must contain the `Authorization` header with the JWT token provided during the auth process. The client may also send the `Content-Type` header, however the TLP Apps Services assumes `application/json` as the content type.

### Messages

As stated all endpoints assume the message body to be valid JSON. If the body fails JSON validation a http status `400` error will be returned with a reason string identifying the issue.

## Client Endpoint Documentation

- [Auth](./auth.md)
- [Patients](./patient.md)
- [Appointments](./appointments.md)
- [Notifications](./notification.md)
