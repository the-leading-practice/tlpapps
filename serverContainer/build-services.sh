#!/usr/bin/bash

GIT_REPO_BASE="https://gitlab.com/the-leading-practice/"
SERVICES_DIR="../tlpservices"
SERVICES="api-gateway \
          identity-service \
          patient-service \
          ghl-service \
          config-service \
          notification-service"

BUILD_DIR="dist"

OP_DIR=`pwd`

function print_usage () {
  echo ""
  echo "usage: build-services.sh <command>"
  echo "  -i | --install  perform an initial install"
  echo "  -u | --update   update all services"
  echo "  -d | --docker   build docker containers"
  echo "  -b | --build    build services"
  echo "  -a | --all      perform all steps"
  echo ""
  echo "NOTE: script must be run as root if building docker containers"

}

function install () {
  echo ""
  echo "======================================================================="
  echo "  Installing Services"
  echo "======================================================================="
  echo ""  
  if [ ! -d "$SERVICES_DIR" ]; then
    # this is a new install
    echo "new install"

    # make the services dir
    echo "    building services directory"
    sudo -u $USER mkdir $SERVICES_DIR
    clone_services

    echo
    echo "The services will need to now be configured."
    echo "Once configured, run this script again to build the services."
    exit
  else
    echo "directory already exists - use update instead - or delete ../tlpservices"
  fi
}

function clone_services () {
  echo ""
  echo "======================================================================="
  echo "  Cloning Services"
  echo "======================================================================="
  echo ""
  for service in $SERVICES
  do
    # clone the services if they don't exist in the directory
    if [ ! -d "$SERVICES_DIR/$service" ]; then
      echo "    cloning $service"
      # clone the service
      sudo -u $USER git clone $GIT_REPO_BASE/$service.git $SERVICES_DIR/$service
    fi
  done
}

function update_services () {
  echo ""
  echo "======================================================================="
  echo "  Updating Services"
  echo "======================================================================="
  echo ""
  for service in $SERVICES
  do
    # clone the services if they don't exist in the directory
    if [ -d "$SERVICES_DIR/$service" ]; then
      echo "    updating $service"
      # clone the service
      cd "$SERVICES_DIR/$service"
      sudo -u $USER git pull origin main
      cd $OP_DIR
    fi
  done
}

function build_dockers () {
  echo ""
  echo "======================================================================="
  echo "  Building Docker Compose"
  echo "======================================================================="
  echo ""

  if [ "$EUID" -ne 0 ]; then 
    echo "must be root to build dockers - use sudo"
    exit
  fi

  echo "running docker-compose..."
  # build the dockers now
  # make sure the the docker containers are shut down
  docker-compose down

  # build the dockers
  docker-compose build
}

function build_services () {
  for service in $SERVICES 
  do
    echo ""
    echo "======================================================================="
    echo "  Building $service"
    echo "======================================================================="
    echo ""

    if [ -f "$SERVICES_DIR/$service/$BUILD_DIR" ]; then
      echo "  deleting $SERVICES_DIR/$service/$BUILD_DIR"
      sudo -u $USER rm -rf $SERVICES_DIR/$service/$BUILD_DIR
    fi

    cd $SERVICES_DIR/$service
    sudo -u $USER npm ci
    sudo -u $USER npm run build
    cd ../
  done

  cd $OP_DIR
}

if [ "$#" -lt 1 ]; then
  print_usage
  exit
fi

while [[ $# -gt 0 ]]; do
  case $1 in
    -i|--install)
      install
      shift
      ;;
    -b|--build)
      build_services
      shift
      ;;

    -u|--update)
      update_services
      shift
      ;;

    -d|--dockers)
      build_dockers
      shift
      ;;

    -a|--all)
      shift
      ;;

    *)
      echo "unknown command"
      print_usage
      exit
      ;;
  esac
done