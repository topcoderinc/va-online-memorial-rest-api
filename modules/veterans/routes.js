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
const { modelConstants } = require('va-online-memorial-data-models');

module.exports = {
  '/veterans': {
    get: {
      controller: 'VeteransController',
      method: 'search'
    },
    post: {
      auth: jwtAuth,
      access: [modelConstants.UserRoles.Admin],
      controller: 'VeteransController',
      method: 'create',
      file: true
    }
  },
  '/veterans/:id': {
    get: {
      auth: [anonymous, jwtAuth],
      controller: 'VeteransController',
      method: 'getSingle'
    },
    put: {
      auth: jwtAuth,
      access: [modelConstants.UserRoles.Admin],
      controller: 'VeteransController',
      method: 'update',
      file: true
    },
    delete: {
      auth: jwtAuth,
      access: [modelConstants.UserRoles.Admin],
      controller: 'VeteransController',
      method: 'remove'
    }
  },
  '/veterans/:id/related': {
    get: {
      auth: [anonymous, jwtAuth],
      controller: 'VeteransController',
      method: 'getRelated'
    }
  }
};
