# Patient Endpoint

Add or update patients.

**Endpoint Url:** https://tlpapps.theleadingpractice.com/api/patient

## Patient Upsert Request

Method POST

Headers

```
Authorization: Bearer authtoken
```

Post Body

```json
{
	requestDate: string,
	rquid: string, // optional
	patients: [
		{
		  patientId: number,
		  firstName: string,
		  lastName: string,
		  address: string, // optional
		  address2: string, // optional
		  city: string, // optional
		  state: string, // optional
		  postalCode: string, // optional
		  country: string, // optional
		  timezone: string,
		  phone: string,
		  home: string,
		  mobile: string,
		  work: string, // one phone number must be provided
		  email: string,
		  dob: string //optional
		}
	]
}
```

### Successful Upsert Response

The service will respond with a 200 code if **any** patient is successfully added or updated. If any patients fail, the failed ids will be sent back to the client.

Status: `200`

Body

```json
{
	message: string,
	success: [
		{
			id: string // patient id
		}
	]
	failed: [
		{
			id: string, // patient id
			status: number, // status code for this failure
			message: string
		}
	]
}
```

### Failed Upsert Response

Returned when no patients are able to be processed. In the event there was an error passing patients to GHL or a connection error - those errors will be passed back to the client.

Status `400, 500, 502, 503, 504`

Body

```json
{
	message: string
}
```
