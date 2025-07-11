# Notification Endpoint

Post a notification to the system to be sent to The Leading Practice.

**Endpoint Url:** http://tlpapps.theleadingpractice.com/api/notification

## Notification Message

Method POST

Headers

```
Authorization: Bearer authtoken
```

Post Body

```json
{
  timestamp: string,
  severity: "Trace" | "Debug" | "Info" | "Warn" | "Error" | "Fatal",
  message: string
}
```

### Successful Response

Status: 200

### Failure Response

Status: 400-405
