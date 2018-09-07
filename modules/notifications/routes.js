

/*
 * Copyright (c) 2018 Topcoder, Inc. All rights reserved.
 */

/**
 * notification route
 */

const constants = require('../../constants');

const jwtAuth = constants.Passports.jwt;

module.exports = {
  '/notifications': {
    get: {
      auth: jwtAuth,
      controller: 'NotificationController',
      method: 'search',
    },
    put: {
      auth: jwtAuth,
      controller: 'NotificationController',
      method: 'markAsRead',
    },
  },
};
