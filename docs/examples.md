# API Examples

## Patient Batch

```json
{
	"requestDate": "2025-07-11T14:00:00",
	"rquid": "3647cb2f-8edf-4c1a-b025-b5f37c46dc88", // optional
	"patients":[
    {
      "patientId": "11223",
      "firstName": "Tommy",
      "lastName": "Tutone",
      "address": "",
      "address2": "",
      "city": "",
      "state": "IN",
      "postalCode": "46140",
      "country": "United States",
      "timezone": "America/New_York",
      "phone": "",
      "mobile": "(112) 867-5309",
      "work": "",
      "email": "mike@uglyyellowbunny.com",
      "dob": ""
    },
    {
      "patientId": "22334",
      "firstName": "Jacob",
      "lastName": "Dedman",
      "address": "",
      "address2": "",
      "city": "",
      "state": "",
      "postalCode": "",
      "country": "",
      "timezone": "America/Los_Angeles",
      "phone": "",
      "mobile": "",
      "work": "+12564998555",
      "email": "jacob@kaizenovate-wrong.com",
      "dob": ""
    }
  ]
}
```

## Update Patient

```json
{
	"requestDate": "2025-07-11T14:30:00",
	"rquid": "5e2a544d-4068-4103-a85c-6687c8da55b2", // optional
	"patients": [
		{
		  "patientId": "22334",
		  "firstName": "Jacob",
		  "lastName": "Dedman",
		  "address": "",
		  "address2": "",
		  "city": "",
		  "state": "",
		  "postalCode": "",
		  "country": "",
		  "timezone": "America/Los_Angeles",
		  "phone": "",
		  "mobile": "",
		  "work": "+12564998555",
		  "email": "jacob@kaizenovate.com",
		  "dob": ""
		}
	]
}
```
> **NOTE:** The system defaults to UPSERTS for both patients and appointments.  You may mix new patients with patient updates.

## Appointment Batch

```json
{
	"requestDate": "2025-07-11T14:00:00",
	"rquid": "78cf8474-d789-489c-9f9a-4f677355e8e9", // optional
	"appointments":[
    {
      "apptId": "123528",
      "patientId": "11223",
      "apptTime": "2025-11-27T08:00:00",
      "apptStatus": "1004" // confirmed
    },
    {
      "apptId": "124146",
      "patientId": "22334",
      "apptTime": "2025-11-28T10:00:00",
      "apptStatus": "1001" // cancelled
    },
    {
      "apptId": "124148",
      "patientId": "22334",
      "apptTime": "2026-01-29T14:00:00",
      "apptStatus": "1004" // confirmed
    }
  ]
}
```
