import './check-npm.js';

import { apolloExpress, graphiqlExpress } from 'apollo-server';
import bodyParser from 'body-parser';
import express from 'express';

import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import { check } from 'meteor/check';
import { Accounts } from 'meteor/accounts-base';
import { _ } from 'meteor/underscore';

const defaultConfig = {
  path: '/graphql',
  maxAccountsCacheSizeInMB: 1,
  graphiql : Meteor.isDevelopment,
  graphiqlPath : '/graphiql',
  graphiqlOptions : {
    passHeader : "'Authorization': localStorage['Meteor.loginToken']"
  },
  configServer: (graphQLServer) => {},
};

const defaultOptions = {
  formatError: e => ({
    message: e.message,
    locations: e.locations,
    path: e.path
  }),
};

export const createApolloServer = (givenOptions = {}, givenConfig = {}) => {

  let graphiqlOptions = Object.assign({}, defaultConfig.graphiqlOptions, givenConfig.graphiqlOptions);
  let config = Object.assign({}, defaultConfig, givenConfig);
  config.graphiqlOptions = graphiqlOptions;

  const graphQLServer = express();

  config.configServer(graphQLServer)

  // GraphQL endpoint
  graphQLServer.use(config.path, bodyParser.json(), apolloExpress(async (req) => {
    let options,
        user = null;

    if (_.isFunction(givenOptions))
      options = givenOptions(req);
    else
      options = givenOptions;

    // Merge in the defaults
    options = Object.assign({}, defaultOptions, options);

    // Get the token from the header
    if (req.headers.authorization) {
      const token = req.headers.authorization;
      check(token, String);
      const hashedToken = Accounts._hashLoginToken(token);

      // Get the user from the database
      user = await Meteor.users.findOne(
        {"services.resume.loginTokens.hashedToken": hashedToken},
        {fields: {
          _id: 1,
          'services.resume.loginTokens.$': 1
        }});

      if (user) {
        const expiresAt = Accounts._tokenExpiration(user.services.resume.loginTokens[0].when);
        const isExpired = expiresAt < new Date();

        if (!isExpired) {
          if (options.context) {
            // don't mutate the context provided in options
            options.context = Object.assign({}, options.context);
          } else {
            options.context = {};
          }

          options.context.userId = user._id;
        }
      }
    }

    return options;

  }));

  // Start GraphiQL if enabled
  if (config.graphiql) {
    graphQLServer.use(config.graphiqlPath, graphiqlExpress(_.extend(config.graphiqlOptions, {endpointURL : config.path})));
  }

  // This binds the specified paths to the Express server running Apollo + GraphiQL
  WebApp.connectHandlers.use(Meteor.bindEnvironment(graphQLServer));
};
