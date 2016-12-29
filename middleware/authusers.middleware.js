'use strict';

/**
 * Module dependencies.
 */
var _ = require('lodash');
var AuthUser = require('../models/authuser.model');
var config = require('../config');

/**
 * User middleware
 */
exports.authByID = function(req, res, next, id) {
  var auth = AuthUser
    .forge({id:req.params.id})
    .fetch({columns:['email']});

  return auth.then ( function(auth) {
	if (!auth) {
      return next(new Error('Failed to load User ' + id));
    }
	  req.profile = auth;
      next();
    })
    .catch(function(err){
      return next(err);
    });
};

/**
 * Require login routing middleware
 */
exports.requiresLogin = function(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.status(401).send({
	  message: 'User is not logged in'
	});
  }

  next();
};

/**
 * Requires api key for internal communications
 */
exports.requiresInternalKey = function(req, res,next){

  var authHeader= req.get('Authorization');
  if (!authHeader){
    //Also accept api key via get param
    authHeader = 'Bearer '+req.param('api_key');
  }


  if (!authHeader){
    return res.status(401).send({
      message: 'No authorization header provided'
    });
  }
  else if (!authHeader.startsWith('Bearer ')){
    return res.status(401).send({
      message: 'No \'Bearer\' string found in Authorization header'
    });
  }
  else {
    var splitAuthHeader = authHeader.split(' ') ;

    if (splitAuthHeader.length != 2){
      return res.status(401).send({
        message: 'No bearer token found'
      });
    }
    else {

      if (splitAuthHeader[1].trim() != config.server.api_key)
      return res.status(401).send({
        message: 'incorrect bearer token'
      });

    }
  }
  next();
};

/**
 * Requires api key for internal communications or user login
 */
exports.requiresInternalKeyOrLogin = function(req, res, next){
    if (req.query.user_id || req.query.su){
      req.isSuper = true;
      exports.requiresInternalKey(req, res, next);
    } else {
      exports.requiresLogin(req, res, next);
    }
};

