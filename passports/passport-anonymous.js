'use strict';

/*
 * Copyright (c) 2018 Topcoder, Inc. All rights reserved.
 */

const AnonymousStrategy = require('passport-anonymous');

/**
 * Export anonymous passport strategy
 * @param passport the passport
 */
module.exports = (passport) => {
  passport.use(new AnonymousStrategy());
};
