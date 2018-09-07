/*
 * Copyright (c) 2018 Topcoder, Inc. All rights reserved.
 */

/**
 * notification service
 */
const logger = require('../../../common/logger');
const models = require('va-online-memorial-data-models');
const _ = require('lodash');
const Joi = require('joi');
const { BadRequestError } = require('../../../common/errors');
const helper = require('../../../common/helper');

/**
 * build db search query
 * @param filter the search filter
 */
function buildDBFilter(user, filter) {
  const where = {};
  where.userId = user.id;
  where.status = filter.status || models.modelConstants.NotificationStatus.New;
  return {
    where,
    offset: filter.offset,
    limit: filter.limit,
    order: [[filter.sortColumn, filter.sortOrder.toUpperCase()]],
  };
}

/**
 * search notifications
 * @param user the notification user
 */
function* search(user, query) {
  const q = buildDBFilter(user, query);
  const docs = yield models.Notification.findAndCountAll(q);
  const items = yield helper.populateUsersForEntities(docs.rows);
  _.each(items, (item) => {
    try {
      item.content = JSON.parse(item.content); // eslint-disable-line
    } catch (e) {
      logger.error(e);
    }
  });
  return {
    items,
    total: docs.count,
    offset: q.offset,
    limit: q.limit,
  };
}

search.schema = {
  query: Joi.object().keys({
    status: Joi.string().valid(_.values(models.modelConstants.NotificationStatus)),
    limit: Joi.limit(),
    offset: Joi.offset(),
    sortColumn: Joi.string().valid('id', 'createdAt', 'updatedAt').default('createdAt'),
    sortOrder: Joi.sortOrder(),
  }),
  user: Joi.object(),
};


/**
 * mark notifications as read
 * @param entity the entity that contains notification id arr
 */
function* markAsRead(entity) {
  const { ids } = entity;
  if (!ids || ids.length <= 0) {
    return;
  }
  yield models.Notification.update(
    { status: models.modelConstants.NotificationStatus.Read },
    { where: { id: { $in: ids } } },
  );
}

markAsRead.schema = {
  entity: {
    ids: Joi.array().items(Joi.number().integer()),
  },
};

/**
 * get all nok user by veteran
 * @param veteranId the veteran id
 */
function* getAllNokUserId(veteranId) {
  const noks = yield models.NextOfKin.findAll({
    where: {
      veteranId,
      status: models.modelConstants.Statuses.Approved,
    },
  });
  return _.uniq(_.map(noks, n => n.userId));
}


/**
 * sent web notification
 * @param notification the notification entity
 */
function* sendWebNotification(notification) {
  yield models.Notification.create(notification);
}

/**
 * send notifications
 * @param notifications the notifications array
 */
function* sendNotifications(notifications) {
  for (let i = 0; i < notifications.length; i += 1) {
    const notification = notifications[i];
    if (notification.type === models.modelConstants.NotificationType.Post) {
      const userPreference = yield models.NotificationPreference
        .findOne({ where: { userId: notification.userId } });
      if (!userPreference) {
        yield sendWebNotification(notification);
      } else if (notification.type === models.modelConstants.NotificationType.Post
        && userPreference[`${notification.subType.toLowerCase()}NotificationsSite`]) {
        yield sendWebNotification(notification);
      }
    } else {
      yield sendWebNotification(notification);
    }
  }
}

/**
 * create notifications by post(story/photo etc ...) created
 * @param entity the post entity
 */
function* createNotificationByPostCreate(entity) {
  const userIdArr = yield getAllNokUserId(entity.veteranId);
  const notifications = _.map(userIdArr, userId => _.extend({
    userId,
    content: JSON.stringify({
      veteranId: entity.veteranId,
    }),
  }, entity));
  yield sendNotifications(notifications);
}

/**
 * create notification by post approved
 * @param entity the post entity
 */
function* createNotificationByPostApproved(entity) {
  yield sendNotifications([_.extend({
    content: JSON.stringify({
      veteranId: entity.veteranId,
      text: `Your ${entity.subType} approved.`,
    }),
  }, entity)]);
}

/**
 * create notification by nok approved
 * @param entity the nok entity
 * @param text the reason
 */
function* createNotificationByNokApproved(entity, text) {
  yield sendNotifications([_.extend({
    content: JSON.stringify({
      veteranId: entity.veteranId,
      text,
    }),
  }, entity)]);
}


module.exports = {
  search,
  markAsRead,
  createNotificationByNokApproved,
  createNotificationByPostApproved,
  createNotificationByPostCreate,
};

logger.buildService(module.exports);
