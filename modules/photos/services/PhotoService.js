'use strict';

/*
 * Copyright (c) 2018 Topcoder, Inc. All rights reserved.
 */

/**
 * Photo service
 */
const Joi = require('joi');
const _ = require('lodash');
const co = require('co');
const config = require('config');
const models = require('va-online-memorial-data-models');
const logger = require('../../../common/logger');
const { NotFoundError, ForbiddenError, BadRequestError } = require('../../../common/errors');
const helper = require('../../../common/helper');
const s3Client = require('../../../lib/s3');
const {
  createNotificationByPostCreate,
  createNotificationByPostApproved,
} = require('../../notifications/services/NotificationService');

/**
 * build db search query
 * @param filter the search filter
 */
function buildDBFilter(filter) {
  const include = [{ model: models.Veteran, as: 'veteran' }, { model: models.File, as: 'photoFile' }];

  const where = {};
  if (filter.veteranId) where.veteranId = filter.veteranId;
  if (filter.userId) where.createdBy = filter.userId;
  if (filter.status) where.status = filter.status;
  return {
    where,
    include,
    offset: filter.offset,
    limit: filter.limit,
    order: [[filter.sortColumn, filter.sortOrder.toUpperCase()]]
  };
}

/**
 * Search photos
 * @param {object} query the query object
 * @param {object} user the current user
 */
function* search(query, user) {
  // if user is not manager of veteran, then only approved records can be shown
  if (query.veteranId) {
    if (!query.status || !user) {
      query.status = models.modelConstants.Statuses.Approved;
    } else if (
      !(yield helper.canManageVeteran(user, query.veteranId)) &&
      query.status !== models.modelConstants.Statuses.Approved
    ) {
      throw new BadRequestError('User can search only approved veteran content.');
    }
  }

  const q = buildDBFilter(query);
  const docs = yield models.Photo.findAndCountAll(q);
  return {
    items: yield helper.populateUsersForEntities(docs.rows),
    total: docs.count,
    offset: q.offset,
    limit: q.limit
  };
}

search.schema = {
  query: Joi.object().keys({
    veteranId: Joi.optionalId(),
    userId: Joi.optionalId(),
    status: Joi.string().valid(_.values(models.modelConstants.Statuses)),
    limit: Joi.limit(),
    offset: Joi.offset(),
    sortColumn: Joi.string().valid('id', 'veteranId', 'title', 'status').default('id'),
    sortOrder: Joi.sortOrder()
  }),
  user: Joi.object()
};

/**
 * Create photo
 * @param {Array} files - the files
 * @param {object} body - the request body
 */
function* create(files, body) {
  yield helper.ensureExists(models.Veteran, { id: body.veteranId });
  const fileMeta = yield helper.uploadFile(files[0]);

  let theId;
  yield models.sequelize.transaction(t => co(function* () {
    // create photo file
    const file = yield models.File.create({
      name: fileMeta.name,
      fileURL: fileMeta.url,
      mimeType: fileMeta.mimeType
    }, { transaction: t });
    // Create photo
    body.photoFileId = file.id;
    const photo = yield models.Photo.create(body, { transaction: t });
    theId = photo.id;
  }));

  yield createNotificationByPostCreate({
    veteranId: body.veteranId,
    createdBy: body.createdBy,
    type: models.modelConstants.NotificationType.Post,
    subType: models.modelConstants.PostTypes.Photo,
  });

  return yield getSingle(theId);
}

create.schema = {
  files: Joi.array().length(1).required(),
  body: Joi.object().keys({
    veteranId: Joi.id(),
    status: Joi.string().valid(_.values(models.modelConstants.Statuses)).required(),
    title: Joi.string().required(),
    createdBy: Joi.id()
  }).required()
};

/**
 * Get single photo
 * @param {Number} id the id
 */
function* getSingle(id) {
  const photo = yield models.Photo.findOne({
    where: { id },
    include: [
      {
        model: models.Veteran,
        as: 'veteran'
      },
      {
        model: models.File,
        as: 'photoFile'
      }
    ]
  });
  if (!photo) throw new NotFoundError(`Photo with id: ${id} does not exist!`);
  photo.viewCount = parseInt(photo.viewCount, 10) + 1;
  yield photo.save();
  return yield helper.populateUsersForEntity(photo);
}

getSingle.schema = {
  id: Joi.id()
};

/**
 * Update photo
 * @param {Number} id - the id
 * @param {Array} files - the files
 * @param {object} body - the request body
 */
function* update(id, files, body) {
  if (body.veteranId) {
    yield helper.ensureExists(models.Veteran, { id: body.veteranId });
  }

  // get existing file name to remove
  const existing = yield getSingle(id);
  const filenameToRemove = existing.photoFile && existing.photoFile.name;

  const fileMeta = yield helper.uploadFile(files[0]);

  yield models.sequelize.transaction(t => co(function* () {
    // create photo file
    const file = yield models.File.create({
      name: fileMeta.name,
      fileURL: fileMeta.url,
      mimeType: fileMeta.mimeType
    }, { transaction: t });
    // update photo
    const photo = yield helper.ensureExists(models.Photo, { id });
    _.assignIn(photo, body);
    photo.photoFileId = file.id;
    yield photo.save({ transaction: t });
  }));

  yield helper.removeFile(filenameToRemove);

  return yield getSingle(id);
}

update.schema = {
  id: Joi.id(),
  files: Joi.array().length(1).required(),
  body: Joi.object().keys({
    veteranId: Joi.optionalId(),
    status: Joi.string().valid(_.values(models.modelConstants.Statuses)),
    title: Joi.string(),
    createdBy: Joi.optionalId(),
    updatedBy: Joi.id()
  }).required()
};

/**
 * Remove photo
 * @param {Number} id - the id
 */
function* remove(id) {
  // get existing file name to remove
  const existing = yield getSingle(id);
  const filenameToRemove = existing.photoFile && existing.photoFile.name;

  const photo = yield helper.ensureExists(models.Photo, { id });
  yield helper.removeFile(filenameToRemove);
  const res = yield photo.destroy();
  return res;
}

remove.schema = {
  id: Joi.id()
};

/**
 * Approve photo
 * @param {Number} id - the id
 * @param {Object} user - the current user
 */
function* approve(id, user) {
  const photo = yield helper.ensureExists(models.Photo, { id });
  if (!(yield helper.canManageVeteran(user, photo.veteranId))) {
    throw new ForbiddenError('User is not allowed to manage the veteran.');
  }
  photo.status = models.modelConstants.Statuses.Approved;
  photo.updatedBy = user.id;
  yield createNotificationByPostApproved({
    veteranId: photo.veteranId,
    createdBy: user.id,
    userId: photo.createdBy,
    type: models.modelConstants.NotificationType.Post,
    subType: models.modelConstants.PostTypes.Photo,
  });
  yield photo.save();
}

approve.schema = {
  id: Joi.id(),
  user: Joi.object().required()
};

/**
 * Reject photo
 * @param {Number} id - the id
 * @param {Object} user - the current user
 */
function* reject(id, user) {
  const photo = yield helper.ensureExists(models.Photo, { id });
  if (!(yield helper.canManageVeteran(user, photo.veteranId))) {
    throw new ForbiddenError('User is not allowed to manage the veteran.');
  }
  photo.status = models.modelConstants.Statuses.Rejected;
  photo.updatedBy = user.id;
  yield photo.save();
}

reject.schema = {
  id: Joi.id(),
  user: Joi.object().required()
};

/**
 * Salute photo
 * @param {Number} id - the photo id
 * @param {Number} userId - the current user id
 */
function* salute(id, userId) {
  const photo = yield helper.ensureExists(models.Photo, { id });

  const s = yield models.PostSalute.findOne({
    where: {
      userId,
      postType: models.modelConstants.PostTypes.Photo,
      postId: id
    }
  });
  if (!s) {
    photo.saluteCount = parseInt(photo.saluteCount, 10) + 1;
    yield photo.save();
    yield models.PostSalute.create({
      userId,
      postType: models.modelConstants.PostTypes.Photo,
      postId: id
    });
  }
}

salute.schema = {
  id: Joi.id(),
  userId: Joi.id()
};

/**
 * Check whether user saluted the photo
 * @param {Number} id - the photo id
 * @param {Number} userId - the current user id
 */
function* isSaluted(id, userId) {
  yield helper.ensureExists(models.Photo, { id });

  if (userId == null) {
    return { saluted: false };
  }

  const s = yield models.PostSalute.findOne({
    where: {
      userId,
      postType: models.modelConstants.PostTypes.Photo,
      postId: id
    }
  });
  return { saluted: !!s };
}

isSaluted.schema = {
  id: Joi.id(),
  userId: Joi.id().allow(null)
};

/**
 * Share photo
 * @param {Number} id - the photo id
 */
function* share(id) {
  const photo = yield helper.ensureExists(models.Photo, { id });
  photo.shareCount = parseInt(photo.shareCount, 10) + 1;
  yield photo.save();
  return photo;
}

share.schema = {
  id: Joi.id()
};


module.exports = {
  search,
  create,
  getSingle,
  update,
  remove,
  approve,
  reject,
  salute,
  isSaluted,
  share
};

logger.buildService(module.exports);
