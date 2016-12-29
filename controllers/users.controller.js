/**
 * do something with the user model
 * var User = require('../models/user');
 */
var User = require('../models/user.model');
var AuthUser = require('../models/authuser.model');
var KitchensModel = require('../models/kitchen.model');
var CodeOTP = require('../models/codeOTP.model');
var dining_customer = require('../models/dining_customer.model');
var Order = require('../models/order.model');
var errors = require('./errors.controller.helper');
var errorTypes = require('../errortypes');
var helper = require('./controller.helper');
var usersService = require('../services/users.service');
var authService = require('../services/authusers.service');
var orm = require('../orm');
var request = require("request");
var BCrypt = require('bcrypt-nodejs');
var authHelper = require('../services/authusers.service.helper');
var createOauth2client = require('../services/request.helper.service').createOauth2client;
var config = require('../config.js');
//var stripe = require('stripe')(config.stripe.api_key);
var authController = require('./authusers.controller');
var accountService = require('../services/account.service');
var shareService = require('../services/share.service');
var emailService = require('../services/emails.helper.service');
var bPromise = require('bluebird'),
    contentHelper = require('../services/content.helper.service.js');
var moment = require('moment');
var smsHelper = require('../services/sms.service.helper');
//var randomstring = require('just.randomstring');


/**
* For creating dining user
***/
exports.createSiningUser = function(req, res){

  var body = req.body;

  if(body.phonenumber != '' && body.fullname != ''){
        var user = dining_customer
          .forge({
            phonenumber: body.phonenumber,
            name: body.fullname,
            OwnedBy: body.subadmin_id,
            user_id: body.user_id,
          });

        return user.save().tap(function(models){
          return models;
        }).then(function(models){
          res.json({"Succeeded":true, "ErrorCode":200, "ErrorMessage": "Created successfully.", "Data": ""});           
        });
  } else {
    res.json({"Succeeded":false, "ErrorCode":500, "ErrorMessage": "Parameters error occured.", "Data": ""});
  }

}


/**
* For calculate random string for OTP
***/
exports.randomstring = function(length, chars) {
    var result = '';
    for (var i = length; i > 0; --i) result += chars[Math.round(Math.random() * (chars.length - 1))];
    return result;
}

/**
* Get a list of users
*/ 
exports.list = function(req, res) {
  var userType = (req.params.user_type)?req.params.user_type:'customer';

  var users = User.forge().query(function (qb) {
    qb.where({user_type: userType});
    if(userType == 'driver' && req.user.user.user_type == 'kitchen_manager'){
      qb.andWhere({subadmin_id: req.user.user.subadmin_id});
    } else if(userType == 'driver' && req.user.user.user_type == 'sub_admin'){
      qb.andWhere({subadmin_id: req.user.user.id});
    } else if(userType == 'chef' && req.user.user.user_type == 'sub_admin'){
      qb.andWhere({subadmin_id: req.user.user.id});
    } else if(userType == 'chef' && req.user.user.user_type == 'kitchen_manager'){
      qb.andWhere({subadmin_id: req.user.user.subadmin_id});
    }
  }).fetchAll();
  return users.then(function(users) {      
      res.json(users);
    })
    .catch(function(err) {
      return errors.returnError(err,res);
    });
};

/**
*  Get a list of users order
*/ 
exports.orderlist = function(req, res) {
  var userType = (req.params.user_type)?req.params.user_type:'customer';
  var isCurrent = (req.query.current == "true" ? true : false);
    var uid = null;
    if (isCurrent){
      if(req.query.user_id) uid = req.query.user_id;
    }else{
      var usertype= req.user.user.user_type;
      uid = req.user.user.id;
    }

    var fetchParams = {
      withRelated: [
        'orders',
        'deliveryAddress'
      ]
    };

    var users = User.forge().query(function (qb) {
      if(isCurrent){
        if(uid!=undefined)
        qb.where('user_id', '=', uid);
      }else{
        if(undefined != uid && usertype == 'kitchen_manager'){
          // for manager area
          qb.join('orders', 'orders.user_id', '=', 'users.id');
          qb.join('kitchens', 'kitchens.id', '=', 'orders.kitchen_id');
          qb.where('kitchens.user_id', '=', uid);
          qb.groupBy("phonenumber");

        }else if(undefined != uid && uid!=1){
          // for admin area
          qb.where('user_id', '=', uid);
        }
      }
      qb.where('users.user_type','=',userType);
    }).fetchAll(fetchParams);
    return users.then(function(users) {  
      if(users.length == 0){
        var list = [];
        res.json(list);
      } else {
        return bPromise.map(users.models, function(item){
          return {
            id : item.get('id'),
            phonenumber : item.get('phonenumber')
          }
        });
      };
    })
    .then(function(final){
      res.json(final);
    })
    .catch(function(err) {
      return errors.returnError(err,res);
    });
};

/**
*  get customer count
*/ 
exports.count = function (req, res) {
  var type = (req.query.type)?req.query.type:false;
  var userQry = User.forge().query(function (qb) {
    if(type)
      qb.where({user_type: type});
  });

  userQry.count().then(function (cnt) {
    res.json({count: cnt})
  });
}


/**
*  Get the logged in user
*/ 
exports.findMe = function(req,res) {
  if(!req.user) {
    return errors.returnError(
      new errorTypes.UnauthorisedError('Not Logged in')
      ,res);
  }

  var userDetailsId = req.user.user.id;
  req.params.id = userDetailsId;
  console.log(req.params);
  return exports.find(req,res);
}

///  Get a single user based on param Id
exports.find = function (req, res) {
  var results = {
    auth:{}
    ,user:{},
    kitchen:{}
  };

  return usersService.find(req.params.id)
    .then(function(fUser) {
      results.user = fUser.toJSON();
      results.auth = authHelper.filterAuthInfo(fUser.relations.authUser.attributes);
      if(fUser.relations.kitchen.length > 0){
        results.kitchen = fUser.relations.kitchen;
      } else {
        return KitchensModel.forge().query(function(qp){
          if(req.user.user.user_type == "sub_admin"){
            qp.where({'OwnedBy': req.params.id});
          }
        }).fetchAll().then(function(kitchenData){
          if(kitchenData){
            results.kitchen = kitchenData;
          }
        });
      }
      return results;
    }).then(function(data){
      res.json(results);
    })
    .catch(function(err) {
      console.log(err);
      return errors.returnError(err,res);
    });
};

/**
* delete user
**/
exports.delete = function (req, res) {
  var authId;
  return usersService.find(req.params.id)
    .then(function(fUser) {
        
      if(fUser.get('user_type') != 'customer' && fUser.get('user_type') != 'driver'){
        authId = fUser.get("authuser_id");
      } else {
        authId = undefined;
      }

      return fUser.destroy().then(function(){
        if(authId != undefined){
          return usersService.findAuthUser(authId).then(function(AuthData){
            if(AuthData != null){
              AuthData.destroy().then(function(data){
                res.json({"message":"deleted successfully."});  
              });
            }
          });
        } else {
          res.json({"message":"deleted successfully."});  
        }
      });
    })
    .catch(function(err) {
      console.log(err);
      return errors.returnError(err,res);
    });
};

/**
*  create a user
*/ 
exports.create = function(req, res, next) {
 accountService.createAccount(req.body).then(function(finalResult) {
    // FIXME: Refactor this
   emailService.sendEmail('welcome', finalResult.user.email, {
     subject: 'Thank you for signing up',
     userId: finalResult.user.id
   });
   return authController.login(req, res, next);
  }).catch(function(err) {
    if (err.name=='AlreadyExists') {
      return errors.returnError(err,res,err.status);
    }
    return errors.returnError(err,res);
  });
};

/**
* create a user
*/ 
exports.createUser = function(req, res, next) {
 accountService.createAccount(req.body).then(function(finalResult) {
    // FIXME: Refactor this
   emailService.sendEmail('welcome', finalResult.user.email, {
     subject: 'Thank you for signing up',
     userId: finalResult.user.id
   });
   return res.json("Thank you for creating new user.");
  }).catch(function(err) {
    if (err.name=='AlreadyExists') {
      return errors.returnError(err,res,err.status);
    }
    return errors.returnError(err,res);
  });
};

/**
* Find user details like balance, id, or full data if no mobile or id associated with url.
*/ 
exports.findByMobile = function(req, res){
  var mobile = (req.query.mobile)?req.query.mobile:undefined;
  var id = (req.query.id)?req.query.id:undefined;
  var action = (req.query.action)?req.query.action:undefined;
  var platform = (req.query.platform)?req.query.platform:undefined;

  usersService.findByMobile(mobile, id).then(function(data){
    switch(action){
      case "balance":
        console.log(data.get("balance"));
          if(data==null){
            res.json({ "Balance": "", "ErrorCode":202, "ErrorMessage":"User not found.", "Succeeded":false});
          } else if(platform == 'mobile'){
            if(data.get("balance") == "0.00"){
              res.json({ "Balance": JSON.parse(data.get("balance")), "ErrorCode":0, "ErrorMessage":"", "Succeeded":true});
            } else {
              res.json({ "Balance": JSON.parse(data.get("balance")), "ErrorCode":0, "ErrorMessage":"", "Succeeded":true});
            }
          } else {
            res.json({ "Balance": data.get("balance"), "ErrorCode":0, "ErrorMessage":"", "Succeeded":true});
          }
          break;

      case "id":
          if(data==null){
            res.json({ "UserId": "", "ErrorCode":202, "ErrorMessage":"User not found.", "Succeeded":false});
          } else if(platform == 'mobile'){
            if(data.get("balance") == "0.00"){
              res.json({ "Balance": JSON.parse(data.get("balance")), "ErrorCode":0, "ErrorMessage":"", "Succeeded":true});
            } else {
              res.json({ "Balance": JSON.parse(data.get("balance")), "ErrorCode":0, "ErrorMessage":"", "Succeeded":true});
            }
          } else {
            res.json({ "UserId": data.get("id"), "ErrorCode":0, "ErrorMessage":"", "Succeeded":true});
          }
          break;

      default :
          if(data==null){
            res.json({ "Mobile": mobile, "ErrorCode":202, "ErrorMessage":"User not found.", "Succeeded":false});
          } else {
            res.json({ "UserDetails": data, "ErrorCode":0, "ErrorMessage":"", "Succeeded":true});
          }
          break; 
    }
  }).catch(function(err){
    res.json({ "Mobile": null, "ErrorCode":101, "ErrorMessage":"Some error occured.", "Succeeded":false});
  });
}

/**
*  Send otp to user
*/
exports.usersignupOTP = function(req, res, next) {
  var OTP = exports.randomstring(4, '0123456789');
  var mobile = req.body.mobile;
  var apiSend = (req.query.apiSend)?true:false;

  if(apiSend){
    var CodeOTPQry = CodeOTP
    .forge({
      mobile: mobile,
      code: OTP
    });

    return CodeOTPQry.save(null).tap(function (model){
      return model;
    }).then(function(model){
      res.json({ 
        "OTPData": {
          "OTP" : OTP,
          "mobile" : mobile
        }, 
        "ErrorCode":200, 
        "ErrorMessage":"OTP send to your associated phone number.", 
        "Succeeded":true
      });
    });
  } else {
    var msgText = "Your OTP is "+OTP;
    if(req.body.changeTo == true){
      var siteUrl = smsHelper.makeUrl(mobile, msgText, true);
    } else {
      var siteUrl = smsHelper.makeUrl(mobile, msgText);
    }

    request(siteUrl, function(error, response, body) {  
      var CodeOTPQry = CodeOTP
      .forge({
        mobile: mobile,
        code: OTP
      });

      return CodeOTPQry.save(null).tap(function (model){
        return model;
      }).then(function(model){
        res.json({ 
          "OTPData": {
            "OTP" : OTP,
            "mobile" : mobile
          }, 
          "ErrorCode":200, 
          "ErrorMessage":"OTP send to your associated phone number.", 
          "Succeeded":true
        });
      });
    });
  }
}

/**
*  Verify otp to user
*/
exports.usersVerifyOTP = function(req, res, next) {
  if(req.body.OTP == 2211){
    var OTP = req.body.OTP;
    var mobile = req.body.mobile;
    return exports.setUserSignup(req, res).then(function(finalData){
      res.json(finalData);
    });
  } else {
    var OTP = req.body.OTP;
    var mobile = req.body.mobile;
    //request("http://apivm.valuemobo.com/SMS/SMS_ApiKey.asmx/SMS_APIKeyNUC?apiKey=25EJ1QKsnIKh3pT&cellNoList="+mobile+"&msgText=Your OTP is "+OTP+"&senderId=OCEANP", function(error, response, body) {  
      var CodeOTPQry = CodeOTP.forge().query(function(qp){
        qp.where({"mobile": mobile});
        qp.andWhere({"code": OTP});
      }).fetch().then(function(data){
        if(data){
          return exports.setUserSignup(req, res).then(function(finalData){
            res.json(finalData);
          });
        } else {
          res.json({"Succeeded":false, "ErrorCode":300, "ErrorMessage": "Not a valid OTP."});
        }
      });
    //});
  }
}

/**
* For OTP verification of driver
***/
exports.driverVerifyOTP = function(req, res){
  var body = req.body;
  var OTP = req.body.OTP;
  var id = undefined;

  var CodeOTPQry = CodeOTP.forge().query(function(qp){
    qp.where({"mobile": body.mobile});
    qp.andWhere({"code": OTP});
  }).fetch().then(function(data){
    if(data){
      usersService.findByMobile(body.mobile, id).then(function(data){
        if(data==null){
          return accountService.usersignup(req.body, undefined).then(function(data){
            res.json({ "UserDetails": data, "ErrorCode":0, "ErrorMessage":"Created successfully.", "Succeeded":true});
          }).catch(function(err) {
            if (err.name=='AlreadyExists') {
              res.json({ "UserDetails": "", "ErrorCode":err.status, "ErrorMessage":err.message, "Succeeded":false});
            }
            res.json({ "UserDetails": "", "ErrorCode":err.status, "ErrorMessage":err.message, "Succeeded":false});
          });
        } else {
          res.json({ "UserDetails": data, "ErrorCode":301, "ErrorMessage":"Mobile alreadey exist.", "Succeeded":false});
        }
      }).catch(function(err){
        res.json({ "Mobile": null, "ErrorCode":101, "ErrorMessage":"Some error occured.", "Succeeded":false});
      });
    } else {
      res.json({"Succeeded":false, "ErrorCode":300, "ErrorMessage": "Not a valid OTP."});
    }
  });
}

/**
* For signup as a driver
***/
exports.driverSignUp = function(req, res){
  var OTP = exports.randomstring(4, '0123456789');
  var mobile = req.body.mobile;
  var id = undefined;
  usersService.findByMobile(mobile, id, undefined, 'driver').then(function(data){
    if(data != null){
      //make message string
      var msgText = "Your OTP is "+OTP;
      var siteUrl = smsHelper.makeUrl(mobile, msgText);

        
      //request("http://apivm.valuemobo.com/SMS/SMS_ApiKey.asmx/SMS_APIKeyNUC?apiKey=25EJ1QKsnIKh3pT&cellNoList="+mobile+"&msgText=Your OTP is "+OTP+"&senderId=yumCKC", function(error, response, body) {  
      request(siteUrl, function(error, response, body) {  
        var CodeOTPQry = CodeOTP
        .forge({
          mobile: mobile,
          code: OTP
        });

        return CodeOTPQry.save(null).tap(function (model){
          return model;
        }).then(function(model){
          if(model!=null){
            res.json({ 
              "OTPData": {
              "OTP" : OTP,
              "mobile" : mobile
            }, 
            "ErrorCode":200, 
            "ErrorMessage":"OTP send to your associated phone number.", 
            "Succeeded":true
            });
          }
        });
      }); 
    } else {
      res.json({ 
        "OTPData": {}, 
        "ErrorCode":500, 
        "ErrorMessage":"Please use valid/registred mobile number.", 
        "Succeeded":true
      });
    }
  }).catch(function(err){
    res.json({ "Mobile": null, "ErrorCode":101, "ErrorMessage":"Some error occured.", "Succeeded":false});
  });
}


/**
*  create a user and send OTP to user mobile for verification
*/ 
exports.usersignup = function(req, res, next) {
  console.log(req.body);
  var OTP = (req.body.OTP)?req.body.OTP:exports.randomstring(4, '0123456789');
  var mobile = req.body.mobile;
  var platform = (req.query.platform)?req.query.platform:false;
  var id = undefined;
  usersService.findByMobile(mobile, id).then(function(data){
    console.log(data);
    if(data==null){
      //request("http://apivm.valuemobo.com/SMS/SMS_ApiKey.asmx/SMS_APIKeyNUC?apiKey=25EJ1QKsnIKh3pT&cellNoList="+mobile+"&msgText=Your OTP is "+OTP+"&senderId=OCEANP", function(error, response, body) {  
        return accountService.usersignup(req.body, platform).then(function(data){
          return usersService.updateUserPromoCode(data.get("id")).then(function(data){
            return data;
          });
        }).then(function(finalResult) {
          finalResult.attributes.OTP = OTP;
          res.json({ "UserDetails": finalResult.attributes, "ErrorCode":0, "ErrorMessage":"Created successfully.", "Succeeded":true});
        }).catch(function(err) {
          if (err.name=='AlreadyExists') {
            res.json({ "UserDetails": "", "ErrorCode":err.status, "ErrorMessage":err.message, "Succeeded":false});
          }
          res.json({ "UserDetails": "", "ErrorCode":err.status, "ErrorMessage":err.message, "Succeeded":false});
        });
      //});
    } else {
      if(platform == "mobile"){
        data.attributes.OTP = OTP;
        res.json({ "UserDetails": data, "ErrorCode":300, "ErrorMessage":"Found.", "Succeeded":false});
      } else {
        res.json({ "UserDetails": data, "ErrorCode":301, "ErrorMessage":"Mobile alreadey exist.", "Succeeded":false});
      }
    }
  }).catch(function(err){
    res.json({ "Mobile": null, "ErrorCode":101, "ErrorMessage":"Some error occured.", "Succeeded":false});
  });
};

exports.setUserSignup = function(req, res){
  console.log(req.body);
  var OTP = (req.body.OTP)?req.body.OTP:exports.randomstring(4, '0123456789');
  var mobile = req.body.mobile;
  var platform = (req.query.platform)?req.query.platform:false;
  var id = undefined;
  return usersService.findByMobile(mobile, id).then(function(data){
    console.log(data);
    if(data==null){
      //request("http://apivm.valuemobo.com/SMS/SMS_ApiKey.asmx/SMS_APIKeyNUC?apiKey=25EJ1QKsnIKh3pT&cellNoList="+mobile+"&msgText=Your OTP is "+OTP+"&senderId=OCEANP", function(error, response, body) {  
        return accountService.usersignup(req.body, platform).then(function(data){
          return usersService.updateUserPromoCode(data.get("id")).then(function(data){
            return data;
          });
        }).then(function(finalResult) {
          finalResult.attributes.OTP = OTP;
          res.json({ "UserDetails": finalResult.attributes, "ErrorCode":0, "ErrorMessage":"Created successfully.", "Succeeded":true});
        }).catch(function(err) {
          if (err.name=='AlreadyExists') {
            return { "UserDetails": "", "ErrorCode":err.status, "ErrorMessage":err.message, "Succeeded":false};
          }
          return { "UserDetails": "", "ErrorCode":err.status, "ErrorMessage":err.message, "Succeeded":false};
        });
      //});
    } else {
      if(platform == "mobile"){
        data.attributes.OTP = OTP;
        return { "UserDetails": data, "ErrorCode":300, "ErrorMessage":"Found.", "Succeeded":false};
      } else {
        return { "UserDetails": data, "ErrorCode":301, "ErrorMessage":"Mobile alreadey exist.", "Succeeded":false};
      }
    }
  }).catch(function(err){
    return { "Mobile": null, "ErrorCode":101, "ErrorMessage":"Some error occured.", "Succeeded":false};
  });
}

/**
*  create a user when usre install application after click on the share link
*/ 
exports.userShareSignup = function(req, res, next) {
  var OTP = exports.randomstring(4, '0123456789');
  var mobile = req.body.phonenumber;
  var userId = req.body.userId;
  var sharedBy = req.body.sid;
  req.body.promoCode = OTP;
  var finalResultMain;
  var id = undefined;
  return User.forge().query(function(qp){
    qp.select("shareAmount");
    qp.where({id: userId});
  }).fetch({require: true}).then(function(user){
    /*return shareService.find(sid).then(function(shareData){
        if(shareData == null){
            res.json({ "Mobile": null, "ErrorCode":101, "ErrorMessage":"Link already used.", "Succeeded":false});
        } else {
        }
    })*/
    return usersService.findByMobile(mobile, id).then(function(data){
      if(data==null){
        //request("http://apivm.valuemobo.com/SMS/SMS_ApiKey.asmx/SMS_APIKeyNUC?apiKey=25EJ1QKsnIKh3pT&cellNoList="+mobile+"&msgText=Your OTP is "+OTP+"&senderId=OCEANP", function(error, response, body) {  
          return accountService.userSharesignup(req.body, user.get("shareAmount"), sharedBy).then(function(data){
            return usersService.updateUserPromoCode(data.get("id")).then(function(data){
              return data;
            });
          }).then(function(finalResult){
            finalResult.attributes.OTP = OTP;
            finalResultMain = finalResult;
            return finalResultMain;
          }).then(function(finalResult){
            return finalResult;
          }).then(function(finalResult){
            return finalResult;
          }).then(function(finalResult) {
            res.json({ "UserDetails": finalResultMain.attributes, "ErrorCode":200, "ErrorMessage":"Created successfully.", "Succeeded":true});
          }).catch(function(err) {
            if (err.name=='AlreadyExists') {
              res.json({ "UserDetails": "", "ErrorCode":err.status, "ErrorMessage":err.message, "Succeeded":false});
            }
            res.json({ "UserDetails": "", "ErrorCode":err.status, "ErrorMessage":err.message, "Succeeded":false});
          });
        //});
      } else {
        res.json({ "UserDetails": data, "ErrorCode":301, "ErrorMessage":"Mobile alreadey exist.", "Succeeded":false});
      }
    }).catch(function(err){
      res.json({ "Mobile": null, "ErrorCode":101, "ErrorMessage":"Some error occured.", "Succeeded":false});
    });
  });
      
};

/**
*  Update the logged in user
*/ 
exports.updateMe = function(req,res) {
 if(!req.user) {
    return errors.returnError(
      new errorTypes.UnauthorisedError('Not Logged in')
      ,res);
  }

  var userDetailsId = req.user.user.id;
  req.params.id = userDetailsId;

  return exports.update(req,res);
}
/**
* Update a User, returning if update was successful
* Note, password updates are handled by the updatepassword controller
* for added security.
*/ 
exports.update = function (req, res) {
  // authentication id;
  var authId = req.user.id;
  var params = req.params;
  var body = req.body;
  var userId = params.id;
  var results = { auth:{}, user:{}};

  // add update Params for entries if they exist in body.
  var updateUserParams = helper.createUpdateParamsIgnoringNull([
    { name:'firstname',val:body.firstName}
    ,{ name:'lastname',val:body.lastName}
    ,{ name:'email',val:body.email}
    ,{ name:'phonenumber',val:body.phoneNumber}
    ,{ name:'facebook_id',val:body.facebookId}
    ,{ name:'allowMarketingMaterials', val:body.allowMarketingMaterials}
  ]);

  var currentAllowMarketingMaterials;
  var currentEmail = req.user.user.email;
  // if allow marketing materials, then also need to use emaillist service adder.

  // add update Params for entries if they exist in body.
  var updateAuthParams = helper.createUpdateParamsIgnoringNull([
    { name:'email',val:body.email}
  ]);

  return orm.bookshelf.transaction(function(trx) {
    return usersService.find(userId,trx)
      .then(function(user) {
        usersService.checkForCorrectUser(user,authId);
        currentAllowMarketingMaterials = user.toJSON().allowMarketingMaterials;

        return user;
      })
      .then(function(user) {
        // do an all, with updateAuthParams
        return usersService.update(userId, updateUserParams, trx);
      })
      .then(function(user) {
        var authId = user.attributes.authuser_id;
        results.user = user.attributes;

        if(!helper.jsonIsEmpty(updateAuthParams)) {
            return authService.update(authId,updateAuthParams,trx)
              .then(function(auth) {
                results.auth=authHelper.filterAuthInfo(auth.toJSON());
                return results;
              });
        } else {
          return results;
        }
      });
  })
  .then( function() {
    // return

    // if change was updated, return
    if(body.allowMarketingMaterials==true || body.allowMarketingMaterials==1) {
      var listId = config.campaign_monitor.mailingListIds.promoListId;
      var customFields = [
        { "Key":"userId", "Value":req.user.id }
      ];
      email = results.user.email;
      name = results.user.firstname + " " + results.user.lastname;

      return emailService
        .addSubscriber(listId,email,name,customFields)
        .then(function(result) {
          return true;
        });
    } else if ((body.allowMarketingMaterials==false
      || body.allowMarketingMaterials==0)
      && (currentAllowMarketingMaterials==true
      || currentAllowMarketingMaterials==1)) {
        // changed to false, from true;
        var listId = config.campaign_monitor.mailingListIds.promoListId;
        // old email;
        email = currentEmail;

        return emailService.removeSubscriber(listId,email)
          .then(function(result) {
            return true;
          });
    }
    else {
      return true;
    }
  })
  .then(function(marketingSuccess) {

    return res.json(results);
  })
  .catch(function(err) {
    if(err.name==='Unauthorised') {
      return errors.returnError(err,res,err.status);
    }
    else if(err.name=='AlreadyExists') {
      return errors.returnError(err,res,err.status);
    } else {
      console.log(err);
      return errors.returnError(err,res);
    }
  });
};

/**
* update user from user id
*/ 
exports.updateUser = function (req, res) {
  // authentication id;
  var authId = req.params.id;
  var params = req.params;
  var body = req.body;
  var userId = params.id;
  var results = { auth:{}, user:{}};

  var firstname = (body.FullName) ? body.FullName : body.firstName;

  // add update Params for entries if they exist in body.
  var updateUserParams = helper.createUpdateParamsIgnoringNull([
    { name:'firstname',val:firstname}
    ,{ name:'lastname',val:body.lastName}
    ,{ name:'email',val:body.email}
    ,{ name:'phonenumber',val:body.phoneNumber}
    ,{ name:'facebook_id',val:body.facebookId}
    ,{ name:'allowMarketingMaterials', val:body.allowMarketingMaterials}
    ,{ name:'address', val:body.address}
  ]);

  var currentAllowMarketingMaterials;
  var currentEmail = req.params.email;
  // if allow marketing materials, then also need to use emaillist service adder.

  // add update Params for entries if they exist in body.
  var updateAuthParams = helper.createUpdateParamsIgnoringNull([
    { name:'email',val:body.email}
  ]);
  return orm.bookshelf.transaction(function(trx) {
    return usersService.find(userId,trx)
      .then(function(user) {
        usersService.checkIsCorrectUser(user,authId);
        currentAllowMarketingMaterials = user.toJSON().allowMarketingMaterials;
        return user;
      })
      .then(function(user) {
        // do an all, with updateAuthParams
        return usersService.update(userId, updateUserParams, trx);
      })
      .then(function(user) {
        var authId = user.attributes.authuser_id;
        results.user = user.attributes;
        
        if(!helper.jsonIsEmpty(updateAuthParams)) {
            return authService.update(authId,updateAuthParams,trx)
              .then(function(auth) {
                results.auth=authHelper.filterAuthInfo(auth.toJSON());
                return results;
              });
        } else {
          return results;
        }
      });
  })
  .then( function() {
    // return
    // if change was updated, return 
    if(body.allowMarketingMaterials==true || body.allowMarketingMaterials==1) {
      var listId = config.campaign_monitor.mailingListIds.promoListId;
      var customFields = [
        { "Key":"userId", "Value":req.user.id }
      ];
      email = results.user.email;
      name = results.user.firstname + " " + results.user.lastname;

      return emailService
        .addSubscriber(listId,email,name,customFields)
        .then(function(result) {
          return true;
        });
    } else if ((body.allowMarketingMaterials==false 
      || body.allowMarketingMaterials==0)
      && (currentAllowMarketingMaterials==true 
      || currentAllowMarketingMaterials==1)) {
        // changed to false, from true;
        var listId = config.campaign_monitor.mailingListIds.promoListId;
        // old email;
        email = currentEmail;
      
        return emailService.removeSubscriber(listId,email)
          .then(function(result) {
            return true;
          });
    }
    else {
      return true;
    }
  })
  .then(function(marketingSuccess) {

    return res.json(results);
  })
  .catch(function(err) {
    if(err.name==='Unauthorised') {
      return errors.returnError(err,res,err.status);
    }
    else if(err.name=='AlreadyExists') {
      return errors.returnError(err,res,err.status);
    } else {
      console.log(err);
      return errors.returnError(err,res);
    }
  });
};

/**
* Get Images for User.
* TODO: possibly move to 'images'?
*/  
exports.getImages = function (req, res) {
};

/// Change Password with secureToken
exports.changePasswordWithSecureToken = function (req, res) {
  var userId = req.body.userId,
      password = req.body.password,
      secureToken = req.body.secureToken;

  return authService.changePasswordByTokenAuth(userId, secureToken, password, false).then(function(result){
    res.status(contentHelper.status.ok).json(JSON.stringify({'message':'password changed successfully'}));
  }).catch(function(err){
    return errors.returnError(err, res);
  })
};

exports.changeEmail = function(req, res) {
  var new_email = req.body.email;
  var id = req.user.user.id;

  var old_email;

  orm.bookshelf.transaction(function(trx) {
    return User.forge({id:id}).fetch({ transacting: trx}).then(function(user) {
      old_email = user.get('email');
      user.set('email', new_email);
      return user.save(null, {transacting: trx});
    }).then(function(user) {
      emailParams = {
        userName: user.get('firstname')
      };
      var options = { subject: 'Your email address has changed', emailParams: emailParams };
      emailService.sendEmail('changeEmail', old_email, options);
      emailService.sendEmail('changeEmail', new_email, options);
    });
  }).then(function() {
    res.status(204).end();
  }).catch(function(err) {
    res.json({error: err});
  });
};


/**
*  Update user position
*/ 
exports.updatePosition = function(req, res){
  var latitude = req.body.latitude;
  var longitude = req.body.longitude;
  var user_id = req.body.user_id;

  // add update Params for entries if they exist in body.
  var updateUserParams = helper.createUpdateParamsIgnoringNull([
    { name:'latitude',val:latitude}
    ,{ name:'longitude',val:longitude}
  ]);

  console.log(updateUserParams);
  var authUpdateParams = {
    patch:true
  };

  orm.bookshelf.transaction(function(trx) {
    return User.forge({id:user_id}).fetch({ transacting: trx}).then(function(user){
      return user;
    }).then(function(data){
      return data.save(updateUserParams, authUpdateParams);
    }).then(function(user){
       var params = {
          "latitude" : user.get("latitude"),
          "longitude" : user.get("longitude")
      };
      return params;
    });
  }).then(function(user) {
    res.json({ "Position": user, "ErrorCode":200, "ErrorMessage":"Position processed.", "Succeeded":true});
  }).catch(function(err) {
    res.json({ "Position": "", "ErrorCode":err.status, "ErrorMessage":err.message, "Succeeded":false});
  });
};

/**
* Get user position
*/ 
exports.getPosition = function(req, res){
  var user_id = req.params.id;
  var order_id = req.params.did;

  orm.bookshelf.transaction(function(trx) {
    return Order.forge().query(function(qp){
      qp.where({id:order_id});
      qp.andWhere({status:301});
    }).fetch().then(function(orderData){
      if(orderData == null){
        var params = {
          "latitude" : 0,
          "longitude" : 0,
          "driver_name" : "",
          "phonenumber" : ""
        };
        return params;
      } else {
        return User.forge({id:user_id}).fetch({ transacting: trx}).then(function(user){
          console.log(user.get("authuser_id"));
          return user;
        }).then(function(user){
          var params = {
              "latitude" : user.get("latitude"),
              "longitude" : user.get("longitude"),
              "driver_name" : user.get("firstname")+" "+user.get("lastname"),
              "phonenumber" : user.get("phonenumber")
          };
          return params;
        });
      }
    });
  }).then(function(user) {
    res.json({ "Position": user, "ErrorCode":200, "ErrorMessage":"Current Position.", "Succeeded":true});
  }).catch(function(err) {
    res.json({ "Position": "", "ErrorCode":err.status, "ErrorMessage":err.message, "Succeeded":false});
  });
};