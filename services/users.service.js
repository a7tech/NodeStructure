var config = require('../config.js');
var User = require('../models/user.model');
var AuthUser = require('../models/authuser.model');
var errorTypes = require('../errortypes');
var logger = require('../services/logger.service');
var path = require('path');
var scriptName = path.basename(__filename);

/**
*  Service for handling User.
*/ 
exports.create = function(userParameters, transaction) {
  logger.debug(scriptName,'Creating user');
  console.log(userParameters);
  var params = userParameters;

  if(!params.email) {
    var err = new Error('no email included');
    throw err;
  } else if(!params.authUserId) {
    var err = new Error('no authenticateId included');
    throw err;
  } else {
    var user = User
      .forge({
        authuser_id: params.authUserId,
        firstname: params.firstName ? params.firstName : '',
        lastname: params.lastName ? params.lastName : '',
        email: params.email,
        phonenumber: params.phoneNumber ? params.phoneNumber : '',
        user_type : params.user_type ? params.user_type : 'customer',
        facebook_id: params.facebookId ? params.facebookId : '',
        stripe_id: params.stripe_id ? params.stripe_id : '',
        subadmin_id: params.subadmin_id ? params.subadmin_id : '',
        address : params.address ? params.address : ''
      });

    if(transaction) {
      return user.save(null, {transacting: transaction});
    } else {
      return user.save();
    }
  }
};

/**
*  Service for handling User.
*/ 
exports.signupUser = function(userParameters, transaction) {
  logger.debug(scriptName,'Creating user');
  logger.debug(scriptName, userParameters.mobile);
  logger.debug(scriptName, config.web_uri);
  var params = userParameters;
  if(userParameters.user_type == 'driver'){
    var user = User
    .forge({
      phonenumber: userParameters.mobile,
      user_type : userParameters.user_type,
      subadmin_id: userParameters.subadmin_id,
      firstname : userParameters.FullName,
      address : userParameters.address
    });
  } else {
    var balanceObj = {
      TW:0,
      KW:{
        kitchens : [],
        balance : [],
        kitchenData : []
      },
      dataTasito : {
        img : "http://tasito.com/images/logo.png"
      }
    };
    balanceObj = JSON.stringify(balanceObj);
    var user = User
    .forge({
      phonenumber: userParameters.mobile,
      user_type : 'customer',
      subadmin_id: userParameters.subadmin_id,
      balance: balanceObj
    });
  }


  if(transaction) {
    return user.save(null, {transacting: transaction});
  } else {
    return user.save();
  }
};

/**
* updateUserPromoCode
*/ 
exports.updateUserPromoCode = function(userId){
  logger.debug(scriptName,'Updating receiver balance.');
    var promoCodeString = "TASI"+userId;
    var authUpdateParams = {
      patch:true
    };
    var authFetchParams = {};

    var foundUser = User.forge({id: userId});

    return foundUser
    .fetch(authFetchParams)
    .then(function(fUser) {
      var userParameters = {promoCode:promoCodeString};
      return fUser.save(userParameters, authUpdateParams);
    });
}

/**
*  Service for handling User.
*/ 
exports.signupSharesUser = function(userParameters, shareAmount, sharedBy, transaction) {
  logger.debug(scriptName,'Creating user');
  logger.debug(scriptName,userParameters.mobile);
  var params = userParameters;
  var user = User
    .forge({
      lastname: userParameters.lastname,
      firstname: userParameters.firstname,
      phonenumber: userParameters.phonenumber,
      //balance: shareAmount,
      user_type : 'customer',
      sharedBy : sharedBy,
      isShared: 1
    });

  if(transaction) {
    return user.save(null, {transacting: transaction});
  } else {
    return user.save();
  }
};

/**
*  Service for handling User.
*/ 
exports.updateReceiverBalance = function(userId, shareAmount, transaction){
  logger.debug(scriptName,'Updating receiver balance.');

    var authUpdateParams = {
      patch:true
    };
    var authFetchParams = {};

    if (transaction) {
      authUpdateParams.transacting = transaction;
      authFetchParams.transacting = transaction;
    }


    var foundUser = User.forge({id: userId});

    return foundUser
    .fetch(authFetchParams)
    .then(function(fUser) {
      var newBalance = parseFloat(shareAmount);
      var userParameters = {
        balance: newBalance
      }
      return fUser.save(userParameters, authUpdateParams);
    });
};

/**
* Update Sender balance when first order made
*/ 
exports.updateSenderBalance = function(userId, shareAmount, transaction){
    logger.debug(scriptName,'Updating sender balance.');

    var authUpdateParams = {
      patch:true
    };
    var authFetchParams = {};

    if (transaction) {
      authUpdateParams.transacting = transaction;
      authFetchParams.transacting = transaction;
    }


    var foundUser = User.forge({id: userId});

    return foundUser
    .fetch(authFetchParams)
    .then(function(fUser) {
      var tempBalance = fUser.get("balance");
      tempBalance = parseFloat(tempBalance);
      var newBalance = tempBalance+parseFloat(shareAmount);
      var userParameters = {
        balance: newBalance
      }
      console.log(fUser);
      return fUser.save(userParameters, authUpdateParams);
    });
}

/**
* Update share status and user receiver balance
*/ 
exports.updateSharedStatus = function(userId, transaction){
  logger.debug(scriptName,'Updating user Shared Status');

  var authUpdateParams = {
    patch:true
  };

  var authFetchParams = {};

  if (transaction) {
    authUpdateParams.transacting = transaction;
    authFetchParams.transacting = transaction;
  }

  var foundUser = User.forge({id: userId});

  return foundUser
    .fetch(authFetchParams)
    .then(function(fUser) {
      var userParameters = {
        isShared : 0
      }
      return fUser.save(userParameters, authUpdateParams);
    });
}

/**
* Update user informations
*/ 
exports.update = function(userId, userParameters, transaction) {
  logger.debug(scriptName,'Updating user');

  var authUpdateParams = {
    patch:true
  };
  var authFetchParams = {};

  if (transaction) {
    authUpdateParams.transacting = transaction;
    authFetchParams.transacting = transaction;
  }

  var foundUser = User.forge({id: userId});

  return foundUser
    .fetch(authFetchParams)
    .then(function(fUser) {
      return fUser.save(userParameters, authUpdateParams);
    });
};

/**
* Create a recorde when user share mobile application for other user
*/ 
exports.createShare = function(expireIn, amount, id, receiverAmount){
  logger.debug(scriptName,'Create Share');

  var authUpdateParams = {
    patch:true
  };
  var userParameters = {
    "shareAmount": amount,
    "receiverAmount": receiverAmount,
    "shareExpire": expireIn
  };
  var authFetchParams = {};

  var foundUser = User.forge({id: id});

  return foundUser
    .fetch(authFetchParams)
    .then(function(fUser) {
      return fUser.save(userParameters, authUpdateParams);
    });
};

/**
* Get all share informations for varification
*/ 
exports.getShare = function(id){
  logger.debug(scriptName,'Get Share');

  var authFetchParams = {};

  var foundUser = User.forge({id: id});

  return foundUser
    .query(function(qp){
      qp.select("shareAmount", "shareExpire", "receiverAmount");
    })
    .fetch(authFetchParams)
    .then(function(fUser) {
      return fUser;
    });
};

/**
*  Find with related parameters, by Id
*/ 
exports.find = function(userId, transaction, authuser_id) {
  var fetchParams = {
    withRelated: [{'addresses':function(qb) {
      qb.where('isactive',true);
    }}
      ,{'authUser':function(qb) {
        qb.select('id','email');
      }},{'kitchen':function(qb) {
        qb.where({'user_id':userId})
      }}
    ]
  };

  if (transaction) {
    fetchParams.transacting = transaction;
  }
  if(authuser_id){
    return User
      .forge({authuser_id:authuser_id})
      .fetch(fetchParams);
  } else {
    return User
      .forge({id:userId})
      .fetch(fetchParams);
  }

};

/**
*  Find with related parameters, by Id
*/ 
exports.findAuthUser = function(id, transaction) {
  if (transaction) {
    fetchParams.transacting = transaction;
  }

  return AuthUser
    .forge({id:id})
    .fetch();
};

/**
*  Find with related parameters, by mobile number
*/ 
exports.findByMobile = function(mobile, id, transaction, user_type) {
  var fetchParams = {};

  if (transaction) {
    fetchParams.transacting = transaction;
  }

  return User
    .forge()
    .query(function(qp){
      if(mobile!=undefined && id==undefined){
        qp.where('phonenumber', mobile);
      } else if(mobile==undefined && id!=undefined){
        qp.where('id', id);
      } else if(mobile!=undefined && id!=undefined){
        qp.where('id', id);
        qp.andWhere('phonenumber', mobile);
      } 
      if(user_type != undefined){
        qp.andWhere('user_type', user_type);
      }
    })
    .fetch(fetchParams);
};

/**
* Chack correct user and throw error when if something wrong
*/ 
exports.checkForCorrectUser = function(fUser, authId) {
  /// Checks for correct user.
  /// Throws error is user is not found or has wrong id.
  if(!fUser) {
    logger.warn(scriptName, 'user not found');
    throw new Error('User not found');
  } else if(fUser.attributes.authuser_id !== authId) {
    logger.warn(scriptName, 'Attempted to update User that is not logged in');
    throw new errorTypes.UnauthorisedError('Attempted to update User that is not logged in');
  }

  return true;
};

/**
* Check correct user 
*/ 
exports.checkIsCorrectUser = function(fUser, authId) {
  /// Checks for correct user.
  /// Throws error is user is not found or has wrong id.
  if(!fUser) {
    logger.warn(scriptName, 'user not found');
    throw new Error('User not found');
  }
  return true;
};

/**
* Get all customer list and message count for chet
* TODO : this only use when socket initilize
*/ 
exports.getMessagesCount= function(subadmin_id, userId){
  if(subadmin_id==0){
    subadmin_id =  userId;
  }
  var result = [];
  return User.forge().query(function(qp){
          qp.select('users.id', 'users.authuser_id', 'users.firstname', 'users.lastname', 'users.user_type', 'phonenumber');
          qp.sum('InstantMessage.is_not_read AS messageCount');
          
          qp.leftJoin('InstantMessage',function(){
              this.on('users.id', '=', 'InstantMessage.MessageBy') //.andOn('InstantMessage.MessageTo', '=', userId)
          });
          qp.where(function(){
              this.where('users.subadmin_id',subadmin_id).andWhereNot('users.subadmin_id', 0).andWhereNot('users.id',userId).whereIn('user_type',['customer'])
          });
          qp.where('InstantMessage.MessageTo', '=', userId);
          qp.groupBy('users.id');
  }).fetchAll().then(function(finalResult){
          var DepricatedIds =[];
          finalResult.forEach(function(s) {
            s.attributes.FullName = s.attributes.firstname+" "+s.attributes.lastname;
            DepricatedIds.push(s.attributes.id);
            result.push(s);
          });
          return User.forge().query(function(qp){
              qp.select('id', 'authuser_id', 'firstname', 'lastname', 'user_type', 'phonenumber');
              qp.where(function(){
                this.where('subadmin_id',subadmin_id).andWhereNot('subadmin_id', 0).andWhereNot('id',userId).whereIn('user_type',['customer'])
              }).whereNotIn('id',DepricatedIds );
          }).fetchAll().then(function(alluserlist){
              alluserlist.forEach(function(s) {
                s.attributes.messageCount = 0;
                s.attributes.FullName = s.attributes.firstname+" "+s.attributes.lastname;
                result.push(s);
              });
              return result;
          })
  });
};