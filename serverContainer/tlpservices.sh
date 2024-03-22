#!/usr/bin/bash

function print_usage () {
  echo ""
  echo "usage: tlpservices.sh <command>"
  echo "  start    start the tlp services stack"
  echo "  stop     stop running tlp services"
  echo "  status   get the current status of the tlp services stack"
  echo "  restart  restart all of the services"
  echo ""

}

if [ "$#" -ne 1 ]; then
  print_usage
  exit
fi

if [ "$EUID" -ne 0 ]; then 
  echo "Please run as root using sudo"
  exit
fi

# only process the first command
case $1 in
  start)
    docker-compose up -d
    ;;

  stop)
    docker-compose down
    ;;

  status)
    docker-compose ps --all
    ;;

  restart)
    docker-compose down
    docker-compose up
    ;;
  esac