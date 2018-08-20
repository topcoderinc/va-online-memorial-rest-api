'use strict';

/*
 * Copyright (c) 2018 Topcoder, Inc. All rights reserved.
 */

/**
 * Contains all routes.
 */

const constants = require('../../constants');

const anonymous = constants.Passports.anonymous;
const jwtAuth = constants.Passports.jwt;

module.exports = {
  '/events': {
    get: {
      auth: [anonymous, jwtAuth],
      controller: 'EventController',
      method: 'search'
    },
    post: {
      auth: jwtAuth,
      controller: 'EventController',
      method: 'create'
    }
  },
  '/events/:id': {
    get: {
      auth: [anonymous, jwtAuth],
      controller: 'EventController',
      method: 'getSingle'
    },
    put: {
      auth: jwtAuth,
      controller: 'EventController',
      method: 'update'
    },
    delete: {
      auth: jwtAuth,
      controller: 'EventController',
      method: 'remove'
    }
  },
  '/events/:id/approve': {
    put: {
      auth: jwtAuth,
      controller: 'EventController',
      method: 'approve'
    }
  },
  '/events/:id/reject': {
    put: {
      auth: jwtAuth,
      controller: 'EventController',
      method: 'reject'
    }
  }
};
