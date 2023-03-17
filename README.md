# Currency Reports (daemons)

The daemons services for the [Currency Reports](https://github.com/emmveqz/currency-reports) application.

### Services

 - [currency-rate-fetcher](./src/currency-rate-fetcher.ts)  
   - Monitors changes in currencies prices (and stores its data).
   - Sends alerts to registered subscriptions when a price is triggered.
   - Sends alerts on a price rising tendency.


### Pre-requisites

 - Have `docker` and `docker-compose` installed  
   (preferably docker-compose >= 2 otherwise you might get errors with the .yaml)
 - Create an access token from your github account with `read:packages` permissions.


### Instructions

 - Set your environment variables in [.env](./.env)  
   Must set your github access token in:  
   `GITHUB_AUTH_TOKEN`  
   in order to be able to install npm packages from the `@emmveqz` scope.
 - Build and run the app with:  
   `docker-compose up -d node_app`  
   (or without the `-d` option to keep watching the logs)


### Clean/reset containers
 - Stop (and optionally remove) the containers:  
   `docker-compose rm -s node_app`  
   `docker-compose rm -s mysql_db`
 - Remove the app images:  
   `docker image rm currency-reports-daemons_node_app:latest`  
   `docker image rm currency-reports-daemons_mysql_db:latest`
