import { Application } from 'express';
import { contactController } from 'controllers/contact';
import { locationController } from 'controllers/location';
import { apptController } from 'controllers/appt';

export const routes = ( app: Application ) => {
  app.route( '/ghl/contact/' )
    .post( contactController.createContact );
  
  app.route( '/ghl/contact/:id' )
    .get( contactController.contact )
    .put( contactController.updateContact );

  app.route( '/ghl/contacts/:query' )
    .get( contactController.findContact );

  app.route( '/location/:locationId' )
    .get( locationController.getLocation );

  app.route( '/ghl/contact/appointments/:id' )
    .get( apptController.getAppointmentsForContact );

  app.route( '/ghl/appointment:id' ).get( apptController.getAppointment );
  
  app.route( '/ghl/appointment/' )
    .put( apptController.updateAppointment )
    .post( apptController.createAppointment );
}
