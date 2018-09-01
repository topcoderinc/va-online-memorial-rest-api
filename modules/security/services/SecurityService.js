/*
 * Copyright (c) 2018 Topcoder, Inc. All rights reserved.
 */

/*
 * User service
 */
const Joi = require('joi');
const config = require('config');
const logger = require('../../../common/logger');
const helper = require('../../../common/helper');
const uuid = require('uuid');
const Sequelize = require('va-online-memorial-data-models').sequelize;
const {
  User,
  modelConstants,
} = require('va-online-memorial-data-models');
const {
  ConflictError,
  UnauthorizedError,
  ValidationError,
} = require('../../../common/errors');
const {
  encryptPassword,
  createToken,
  comparePassword,
  getExpiresDate,
} = require('../helper');

/**
 * Register user
 * @param {object} user - The user object
 */
function* register(user) {
  // Check if email is already registered
  let existing = yield User.findOne({ where: { email: user.email } });
  if (existing) throw new ConflictError(`Email: ${user.email} is already registered.`);

  // Check if username is already registered
  existing = yield User.findOne({ where: { username: user.username } });
  if (existing) throw new ConflictError(`Username: ${user.username} is already registered.`);

  // Generate token
  const token = uuid();
  const link = `${config.appURL}/api/v1/verify-email?email=${user.email}&token=${token}`;
  yield helper.sendEmail({
    to: user.email,
    subject: 'Verify Your Email',
    html: `Dear ${user.email}<br/> <br/>` +
    `Thank you for signing up. Please click on this <a href="${link}">link</a> which will validate the email address that you used to register.` +
    '<br/>',
  });
  user.role = modelConstants.UserRoles.User; // eslint-disable-line no-param-reassign
  user.status = modelConstants.UserStatuses.Blocked; // eslint-disable-line no-param-reassign
  // Encrypt password
  user.passwordHash = yield encryptPassword(user.password); // eslint-disable-line no-param-reassign
  delete user.password; // eslint-disable-line no-param-reassign
  const newUser = yield User.create(user);
  newUser.accessToken = token;
  newUser.accessTokenExpiresAt = getExpiresDate(config.tokenExpiresIn);

  const updatedUser = yield newUser.save();
  return updatedUser.toJSON();
}

register.schema = {
  user: Joi.object().keys({
    username: Joi.string().required(),
    email: Joi.string().email().required(),
    firstName: Joi.string().allow(['']),
    lastName: Joi.string().allow(['']),
    mobile: Joi.string().allow(['']),
    gender: Joi.string().allow(['']),
    countryId: Joi.number().integer().min(1),
    password: Joi.string().required(),
  }).required(),
};

/**
 * Login
 * @param {object} credentials - The login credentials
 */
function* login(credentials) {
  let filter;

  const where = key => Sequelize.where(
    Sequelize.fn('lower', Sequelize.col(key)),
    Sequelize.fn('lower', credentials.email),
  );
  if (/@/.test(credentials.email)) {
    filter = { where: where('email') };
  } else {
    filter = { where: where('username') };
  }
  const user = yield User.findOne(filter);

  if (!user) throw new UnauthorizedError('Invalid credentials!');
  if (user.status === modelConstants.UserStatuses.Blocked) {
    throw new UnauthorizedError('Account is not verified.');
  }
  if (user.status !== modelConstants.UserStatuses.Active) throw new UnauthorizedError('Account is not active.');

  // Check if password matches with the encrypted password
  const passwordMatch = yield comparePassword(credentials.password, user.passwordHash);
  if (!passwordMatch) throw new UnauthorizedError('Invalid credentials!');

  // Generate token
  const token = createToken(user.toJSON());
  user.accessToken = token;
  user.accessTokenExpiresAt = getExpiresDate(config.tokenExpiresIn);
  user.lastLogin = new Date();

  const updatedUser = yield user.save();
  return updatedUser.toJSON();
}

login.schema = {
  credentials: Joi.object().keys({
    email: Joi.string().required(),
    password: Joi.string().required(),
  }).required(),
};

/**
 * Initiate forgot password
 * @param {object} body - The request body
 */
function* initiateForgotPassword(body) {
  const user = yield helper.ensureExists(User, { email: body.email });
  // Generate token
  const token = createToken({ email: body.email });
  user.forgotPasswordToken = token;
  user.forgotPasswordTokenExpiresAt = getExpiresDate(config.tokenExpiresIn);
  yield user.save();
  // simply log the token
  logger.info(`Forgot password token: ${token}`);
}

initiateForgotPassword.schema = {
  body: Joi.object().keys({
    email: Joi.string().email().required(),
  }).required(),
};

/**
 * Change forgot password
 * @param {object} body - The request body
 */
function* changeForgotPassword(body) {
  const user = yield helper.ensureExists(User, { email: body.email });
  if (user.forgotPasswordToken !== body.forgotPasswordToken) {
    throw new ValidationError('Invalid forgot password token.');
  }
  if (user.forgotPasswordTokenExpiresAt.getTime() < new Date().getTime()) {
    throw new ValidationError('Forgot password token expired.');
  }
  // Encrypt password
  user.passwordHash = yield encryptPassword(body.newPassword);
  user.forgotPasswordToken = null;
  user.forgotPasswordTokenExpiresAt = null;
  yield user.save();
}

changeForgotPassword.schema = {
  body: Joi.object().keys({
    email: Joi.string().email().required(),
    newPassword: Joi.string().required(),
    forgotPasswordToken: Joi.string().required(),
  }).required(),
};

/**
 * Update password
 * @param {Number} userId - the user id
 * @param {object} body - The request body
 */
function* updatePassword(userId, body) {
  const user = yield helper.ensureExists(User, { id: userId });
  // Check if old password matches with the encrypted password
  const passwordMatch = yield comparePassword(body.oldPassword, user.passwordHash);
  if (!passwordMatch) throw new UnauthorizedError('Invalid credentials!');
  // Encrypt password
  user.passwordHash = yield encryptPassword(body.newPassword);
  yield user.save();
}

updatePassword.schema = {
  userId: Joi.number().integer().min(1).required(),
  body: Joi.object().keys({
    oldPassword: Joi.string().required(),
    newPassword: Joi.string().required(),
  }).required(),
};

/**
 * verify Email with token
 * @param entity the token entity
 */
function* verifyEmail(entity) {
  const user = yield helper.ensureExists(User, { email: entity.email });

  if (user.status === modelConstants.UserStatuses.Active) {
    throw new ValidationError('User already verified');
  }
  if (user.accessToken === entity.token) {
    user.status = modelConstants.UserStatuses.Active;
    user.accessToken = null;
    yield user.save();
  } else {
    throw new ValidationError('Token error');
  }
  return { message: `${entity.email} verify succeed` };
}

module.exports = {
  register,
  login,
  verifyEmail,
  initiateForgotPassword,
  changeForgotPassword,
  updatePassword,
};

logger.buildService(module.exports);
