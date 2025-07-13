# Appointment Endpoint

Add or update appointments.

**Endpoint URL:** https://tlpapps.theleadingpractice.com/api/appt

## Appointment Upsert

Method POST

Headers

```
Authorization: Bearer authtoken
```

Post Body

```json
{
  requestDate: string,
  rquid?: string, //optional
  appointments:[
	  {
	  	patientId: number,
	   	apptId: number,
	    appointmentTime: string,
	    title: string, // optional
	    appointmentStatus: string,
	    address: string // optional
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
	status: string,
	message: string,
	success: [
		{
			apptId: string // patient id
		}
	]
	failed: [
		{
			apptId: string, // appointment id
			status: number, // status code for this failure
			message: string
		}
	]
}
```

### Failed Upsert Response

Returned when no appointments are able to be processed. In the event there was an error passing appointments to GHL or a connection error - those errors will be passed back to the client.

Status: `400-405, 500-504`

Body

```json
{
	message: string
}
```
