# TLP Server
This repo contains the entire TLP Server Structure dockerized and ready to run.  This project contains the necessary files to build the services and deploy them via docker.  

**The steps below are intended for development environments only.**  Production updating and deployment will be handled much differently.

## Initial Install
To install and build the tlp services run:

```
$ ./build-services.sh
```

The first time the script is run it will check for the required directories and if not found create the directory and clone the services.  Once the services are cloned - you will be notified to configure the services before the build can be performed.  To configure the service cd into each service and edit the .env file.  For production these environment variables will be moved to a centralized location.

### Tip
For sanity you may want to use the git credential helper to securely store your git credentials.  

```
$ git config --global credential.helper store
```

>Once you run the command you will only be asked to log into the git repo server one time.  Git will manage >these credentials from this point forward.
>
>There are a number of services that will be cloned and, if you don't take this step, you will be required to >log into the git repo server for each one.



## Building the Server
We first need to build each service to it's own build directory. We do that by running the command:

```
$ ./build-services.sh
```
This will build each service and stage it so it will be added to it's own conainterized docker image in the next step.


## Starting and Stopping the Server
Now we need to build each docker image and start it.  Docker Compose handles the heavy lifting here.  To build the docker images and get them running we run the following command:

```
$ docker-compose up
```
After this if we need to start the system, we can simply use:
```
$ docker-compose start
```

To stop the running system we use:
```
$ docker-compose stop
```

## How to update the system after new code has been released
When the system has been updated and new code has been released, to update we simply need to run through the above again after doing some house keeping.  We will need to pull the new code and reset the state of the services.
```
$ docker-compose stop
$ docker-compose down
$ git pull origin main

... follow the steps from above
```

