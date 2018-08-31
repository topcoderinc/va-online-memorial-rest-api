

/*
 * Copyright (c) 2018 Topcoder, Inc. All rights reserved.
 */

/**
 * This file defines helper methods
 */
const _ = require('lodash');
const co = require('co');
const config = require('config');
const errors = require('./errors');
const util = require('util');
const models = require('va-online-memorial-data-models');
const path = require('path');
const fs = require('fs-extra');
const uuidv4 = require('uuid/v4');
const s3Client = require('../lib/s3.js');
const nodemailer = require('nodemailer');
const logger = require('../common/logger');

const transporter = nodemailer.createTransport(_.extend(config.email, { logger }), {
  from: `${config.email.auth.user}`,
});

/**
 * Wrap generator function to standard express function
 * @param {Function} fn the generator function
 * @returns {Function} the wrapped function
 */
function wrapExpress(fn) {
  return function wrapGenerator(req, res, next) {
    co(fn(req, res, next)).catch(next);
  };
}

/**
 * Wrap all generators from object
 * @param obj the object (controller exports)
 * @returns {Object|Array} the wrapped object
 */
function autoWrapExpress(obj) {
  if (_.isArray(obj)) {
    return obj.map(autoWrapExpress);
  }
  if (_.isFunction(obj)) {
    if (obj.constructor.name === 'GeneratorFunction') {
      return wrapExpress(obj);
    }
    return obj;
  }
  _.each(obj, (value, key) => {
    obj[key] = autoWrapExpress(value);
  });
  return obj;
}

/**
 * Remove file.
 * @param filename the file name
 */
function* removeFile(filename) {
  if (!filename) return;

  if (process.env.NODE_ENV === 'production') {
    yield s3Client.deleteFile(filename);
  } else {
    const filepath = path.join(__dirname, '../public/upload', filename);
    yield fs.remove(filepath);
  }
}

/**
 * Remove files.
 * @param filenames the file names
 */
function* removeFiles(filenames) {
  if (!filenames) return;
  for (let i = 0; i < filenames.length; i += 1) {
    yield removeFile(filenames[i]);
  }
}

/**
 * Uploads file to S3 in production. In development, it only generates
 * metadata since the uploading to local storage is handled by middleware.
 * @param file the file object
 */
function* uploadFile(file) {
  if (!file) return;

  const fileMeta = {
    mimeType: file.mimetype,
    originalName: file.originalname,
  };

  if (process.env.NODE_ENV === 'production') {
    const uuid = uuidv4();
    yield s3Client.uploadFile(file, uuid);
    fileMeta.name = uuid;
    fileMeta.url = s3Client.fileUrl(uuid);
  } else {
    // Uploads to local directory are actually handled by multer middleware
    // This method only creates uniformity for the metadata
    fileMeta.name = file.filename;
    fileMeta.url = `${config.appURL}/upload/${file.filename}`;
  }

  return fileMeta;
}

/**
 * Parses an uploaded file name from its url.
 * Primarily used for NextOfKin proofs since the original file name
 * is stored on the model.
 * @param url the file's url
 */
function parseFileNameFromUrl(url) {
  return url.split('/').pop();
}

/**
 * Ensures there is one entity, and return it
 * @param Model the model
 * @param where the where clause
 * @returns {Object} the found entity
 */
function* ensureExists(Model, where) {
  const entity = yield Model.findOne({ where });
  if (!entity) {
    throw new errors.NotFoundError(`cannot find entity ${util.format(Model)} where: ${JSON.stringify(where)}`);
  }
  return entity;
}

/**
 * Ensures the entities exist
 * @param Model the model
 * @param ids the ids
 */
function* ensureEntitiesExist(Model, ids) {
  if (!ids) return;
  for (let i = 0; i < ids.length; i += 1) {
    yield ensureExists(Model, { id: ids[i] });
  }
}

/**
 * Check whether user can manage the veteran
 * @param user the user
 * @param veteranId the veteran id
 * @returns {Boolean} whether user can manage the veteran
 */
function* canManageVeteran(user, veteranId) {
  if (user.role === models.modelConstants.UserRoles.Admin) return true;
  const entity = yield models.NextOfKin.findOne({
    where: {
      userId: user.id,
      veteranId,
      status: models.modelConstants.Statuses.Approved,
    },
  });
  return !!entity;
}

/**
 * Get user info.
 * @param id the user id
 * @returns {Object} user info
 */
function* getUserInfo(id) {
  return yield models.User.findOne({
    attributes: ['id', 'username', 'email', 'firstName', 'lastName'],
    where: { id },
  });
}

/**
 * Populate createdBy/updatedBy users for entity.
 * @param {Object} entity the entity
 * @returns {Object} the entity pupulated with users
 */
function* populateUsersForEntity(entity) {
  if (!entity) return entity;
  const e = entity.toJSON();
  if (e.createdBy) {
    e.createdBy = yield getUserInfo(e.createdBy);
  }
  if (e.updatedBy) {
    e.updatedBy = yield getUserInfo(e.updatedBy);
  }
  return e;
}

/**
 * Populate createdBy/updatedBy users for entities.
 * @param {Array} entities the entities
 * @returns {Array} the entities pupulated with users
 */
function* populateUsersForEntities(entities) {
  if (!entities) return entities;
  const res = [];
  for (let i = 0; i < entities.length; i += 1) {
    res.push(yield populateUsersForEntity(entities[i]));
  }
  return res;
}

/**
 * send email to user
 * @param emailEntity the email entity ,  {to:,subject:,text:,html:}
 * @returns {Promise}
 */
function* sendEmail(emailEntity) { // eslint-disable0line
  return new Promise((resolve, reject) => {
    transporter.sendMail(emailEntity, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * verify Email with token
 * @param entity the token entity
 */
function* verifyEmail(entity) {
  const user = yield getUserByEmail(entity.email, true);

  if (user.verified) {
    throw new errors.HttpStatusError(httpStatus.BAD_REQUEST, 'user already verified');
  }
  if (user.verificationToken === entity.verificationToken) {
    user.verified = true;
    user.verificationToken = null;
    yield user.save();
  }
  return { message: `${entity.email} verify succeed` };
}

module.exports = {
  wrapExpress,
  verifyEmail,
  sendEmail,
  autoWrapExpress,
  removeFile,
  removeFiles,
  ensureExists,
  ensureEntitiesExist,
  canManageVeteran,
  populateUsersForEntity,
  populateUsersForEntities,
  uploadFile,
  parseFileNameFromUrl,
};
