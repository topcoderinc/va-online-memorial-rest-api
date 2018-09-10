'use strict';

/*
 * Copyright (c) 2018 Topcoder, Inc. All rights reserved.
 */

/**
 * Notification controller
 */
const NotificationService = require('../services/NotificationService');

/**
 * Search notifications
 * @param req the request
 * @param res the response
 */
function* search(req, res) {
  res.json(yield NotificationService.search(req.user, req.query));
}

/**
 * mark notifications to read
 * @param req the request
 * @param res the response
 */
function* markAsRead(req, res) {
  res.json(yield NotificationService.markAsRead(req.body));
}


module.exports = {
  search,
  markAsRead,
};
