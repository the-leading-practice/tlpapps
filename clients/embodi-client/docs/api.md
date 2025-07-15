# EMBODI API

## Create Patient
used to create a patient and get the patient id and schedule token
https://staging.portal.embodihealth.com/kaizenovate/patient/1.0.0/leadform/create-patient

POST Payload:
```json
{
	"practice_id": "647fa1afdec58400128d10ae",
	"first_name": "First",
	"last_name": "Last",
	"phone1": "4155551212",
	"email":testing@djake.com,
	"dob": "1990-09-19",
	"privacy_agreement": true,
	"contact_agreement": true,
	"elapsed_time": 52858, // elapsed time on the form in ms
	"password": false // always send as false
}
```

Response:
```json
{
	"id": "6837d18e35acbdb95375801d",  // this is the id for the user
	"leadform_schedule_token": "Kyhz9HnQ967CiA==" // this is the token we use for subsequent requests
}
```

## Get Availabilities
get new appointment availability for a practice for a specific current/upcoming week of the year
https://staging.portal.embodihealth.com/kaizenovate/patient/1.0.0/leadform/get-availabilities?practice_id={practice_id}&week={week}
(Example:https://staging.portal.embodihealth.com/kaizenovate/patient/1.0.0/leadform/get-availabilities?practice_id=647fa1afdec58400128d10ae&week=22)

Response:
```json
{
	"appointment_time_zone": "America/New_York",
	"appointment_times": {
	"sun": [],
	"mon": [],
	"tue": [],
	"wed": [],
	"thu": [
		1748523600,
		1748525400,
		1748527200,
		1748529000,
		1748530800,
		1748545200
	],
	"fri": [
		1748613600,
		1748615400,
		1748617200
	],
		"sat": []
	}
}
```

Each day of the requested week is shown here with a list of available starting appointment times for new patient appointments only. Numbers provided here are each epoch timestamps in GMT. You should adjust them for the time zone provided as appointment_time_zone – as the want to always display the available options in the time zone of the practice – not the current borwser’s timestamp (if they are different).

## Schedule appointment
schedules the new patient at the requested time. In most cases, you’ll be able to get the time you need, but in rare cases, availability may have shifted since the availabilities have been accessed.
https://staging.portal.embodihealth.com/kaizenovate/patient/1.0.0/leadform/appointment

POST Payload:
```json
{
	"practice_id": "647fa1afdec58400128d10ae", // each practice will have a different practice id we will provide you with
	"token": "Kyhz9HnQ967CiA==",  // use the token from create patient
	"start_time": "1748523600", // when the form was started as utc epoch timestamp
	"form_version": "B" // we are using version B because it requires less info before creating the lead
}
```

Response:
```json
{
	"appointment_time_zone": "America/New_York",
	"appointment_start_time": 1748523600,
	"provider_name": "Dr. Jay Greenstein",
	"provider_image": "wp-content/uploads/2019/06/headshot-jay-scaled.jpg", // should this be a full url
	"practice_name": "Kaizenovate Test Practice",
	"practice_address": "123 Test Street\nSuite 1000\nTest, VA 22030"
}
```
 
## Supplemental Data
provide additional data to EMBODI after the appointment has been scheduled
https://staging.portal.embodihealth.com/kaizenovate/patient/1.0.0/leadform/update-patient

POST Payload:
```json
{
	"practice_id": "647fa1afdec58400128d10ae", // same as in schedule appointment
	"referral_question": [
		"instagram"
	],
	"referral_question_comment": "",
	"referral_code": "",
	"injury_question": [
		"auto_accident"
	],
	"visit_reason": "Reason for visit",
	"insurance_carrier": "Insurance carrier",
	"insurance_id_number": "ID number here",
	"appt_agreement": true,
	"voice_reminder": true,
	"elapsed_time": 802328,
	"password": false,
	"token": "Kyhz9HnQ967CiA=="  // same as in schedule appointment
}
```

Response:
```json
{
	 "id": "6837d18e35acbdb95375801d"  // this is the id for the user
}
```
