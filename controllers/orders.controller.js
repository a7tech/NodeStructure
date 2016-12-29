/**
 Controller for Order
 */
var utils = require('../services/utilities.service');
var config = require('../config');
//var stripe = require('stripe')(config.stripe.api_key);
var createOauth2client = require('../services/request.helper.service').createOauth2client;
var orm = require('../orm');
var Order = require('../models/order.model');
var ordernote = require('../models/ordernote.model');
var User = require('../models/user.model');
var KitchenModel = require('../models/kitchen.model');
var Payment = require('../models/payment.model');
var errorTypes = require('../errortypes');
var errors = require('./errors.controller.helper');
var _ = require('lodash');
var paymentService = require('../services/3rdparty/payments.service');
var Promise = require('bluebird');
var moment = require('moment');
var logger = require('../services/logger.service');
var path = require('path');
var UsersService = require('../services/users.service');
var AddressesService = require('../services/addresses.service');
var scriptName = path.basename(__filename),
    emailService = require('../services/3rdparty/email.service'),
    feast = require('../services/content.helper.service');
//TODO: say order and request a driver
//API Route to call when maxOptra calls back with a driver information
//API Route to call when kitchen completed an order

var ordersManager = require('../managers/orders.manager');
var operationsService =require('../services/operations.service');
var deliveryManager = require('../managers/delivery.manager');
var request = require("request");
var TinyURL = require('tinyurl');
var smsHelper = require('../services/sms.service.helper');

exports.checkout = function (req, res) {
  // use req.user.user, not authUser;
  //var user = req.user.user;
  ordersManager.checkoutOrder(user, req.body.card_id,req.params.id)
    .then(function(receipt){
      return res.status(201).json(receipt);
    })
    .catch(function(err){
      if (err.status ==undefined ){
        return res.status(500).send('unknown error');
      }
      else {
        return res.status(err.status).json(err);
      }
    });
};

exports.addMobile = function(req, res){

}

exports.create = function (req, res) {
  //var user = req.user.user;
  var newOrder= req.body;
  //ordersManager.createOrder(newOrder,user)
  ordersManager.createUserOrder(newOrder)
    .then(function(order){
      return res.json(order);
    })
    .catch(function(err){
      return res.status(500).json(err);
    });
};

//assigne a driver to orders
exports.assigneDriver = function(req, res){
  var body = req.body;
  var phonenumber = req.body.phonenumber;
  var orderList = body.orderList;

  return ordersManager.assigneDriver(orderList, body.driver_id, body.driver_name).then(function(result){
    var order = result;
    var orderStatus = order.get('status');
    console.log("orderStatus");
    
    var ordermap;
    if(orderStatus == 100){
        var orderStatus = "Order Received";
        ordermap = 1;
    } else if(orderStatus == 202){ 
        var orderStatus = "Preparing";
        ordermap = 2;
    } else if(orderStatus == 204){ 
        var orderStatus = "Preparing";
        ordermap = 2;
    } else if(orderStatus == 301){ 
        var orderStatus = "On The Way";
        ordermap = 3;
    } else if(orderStatus == 308){ 
        var orderStatus = "On The Way";
        ordermap = 3;
    } else if(orderStatus == 303){ 
        var orderStatus = "Delivered";
        ordermap = 4;
    } else if(orderStatus == 400){ 
        var orderStatus = "Complete";
        ordermap = 5;
    }
    order.set("orderStatus", orderStatus);
    return order;
  }).then(function(data){
      TinyURL.shorten(config.feast_api_uri+"/track/driver?driver="+body.driver_id+"&order_id="+orderList[0], function(resS) {
          var messageString = "Your order is now on the way. Your order amount "+data.get("totalAmount")+" will deliver in 30 minutes.";
          /*request("http://apivm.valuemobo.com/SMS/SMS_ApiKey.asmx/SMS_APIKeyNUC?apiKey=25EJ1QKsnIKh3pT&cellNoList="+phonenumber+"&msgText="+messageString+"&senderId=yumCKC", function(error, response, body) {  
            return res.json(data);
          });*/

          //request("http://apivm.valuemobo.com/SMS/SMS_ApiKey.asmx/SMS_APIKeyNUC?apiKey=25EJ1QKsnIKh3pT&cellNoList="+phonenumber+"&msgText="+messageString+"&senderId=yumCKC", function(error, response, body) {  
          if(data.get("changeTo") == 1){
            var siteUrl = smsHelper.makeUrl(phonenumber, messageString, true);
          } else {
            var siteUrl = smsHelper.makeUrl(phonenumber, messageString);
          }

          request(siteUrl, function(error, response, body) {  
            return res.json(data);
          });
      });
  })
}

exports.createAppOrder = function (req, res) {
  //var user = req.user.user;
  var newOrder= req.body;
  var phonenumber = req.body.phonenumber;
  var user_id=newOrder.user_id;
  var sharedBy=newOrder.sharedBy;
  var isShared=newOrder.isShared;
  var subadmin_id=newOrder.subadmin_id;
  var shareAmount,receiverAmount;
  //ordersManager.createOrder(newOrder,user)
  ordersManager.createAppUserOrder(newOrder).then(function(order){
    console.log("isShared");
    console.log(isShared);
      if(isShared==1){
        return User.forge().query(function(qp){
          qp.select("shareAmount", "receiverAmount");
          qp.where({id: subadmin_id});
        }).fetch({require: true}).then(function(user){
          console.log("shareAmountreceiverAmount");
          console.log(user);
          receiverAmount=user.get("receiverAmount");
          shareAmount=user.get("shareAmount");
          return UsersService.updateReceiverBalance(user_id, receiverAmount).then(function(data){
            return order;
          });
        }).then(function(order){
          return UsersService.updateSenderBalance(sharedBy, shareAmount).then(function(data){
            return order;
          });
        }).then(function(order){
          return UsersService.updateSharedStatus(user_id).then(function(data){
            return order;
          })
        });
      } else {
        return order;
      }
  })
  .then(function(order){
    var messageString = "Thankyou we received your order.";
    if(order.changeTo == 1){
      var siteUrl = smsHelper.makeUrl(phonenumber, messageString, true);
    } else {
      var siteUrl = smsHelper.makeUrl(phonenumber, messageString);
    }

    //request("http://apivm.valuemobo.com/SMS/SMS_ApiKey.asmx/SMS_APIKeyNUC?apiKey=25EJ1QKsnIKh3pT&cellNoList="+phonenumber+"&msgText=Thankyou we received your order.&senderId=yumCKC", function(error, response, body) {  
    request(siteUrl, function(error, response, body) {  
      res.json({"ErrorCode":0, "ErrorMessage":"", "Succeeded":true, "Order": order});
    });
  })
  .catch(function(err){
    res.json({"ErrorCode":500, "ErrorMessage":err.message, "Succeeded":false, "Order": ""});
  });
};

exports.read = function (req, res) {
  var kountaRequest = createOauth2client(config.kounta.auth);
  var isCurrent = (req.query.current == "true" ? true : false);
  var uid = (req.query.user_id && req.isSuper) ? req.query.user_id : req.user.user.id;

  var ordersQry = Order.forge().query(function (qb) {
    if (isCurrent){
      qb.where({user_id: uid})
        .andWhere('status', '<>', Order.status.CANCELED)
        .andWhere('status', '<>', Order.status.COMPLETE)
        .andWhere('date', '>', moment().startOf('day').format());
    } else {
      qb.where({user_id: uid});
    }
    qb.orderBy('date', 'DESC');
  }).fetchAll();

  ordersQry.then(function (orders) {
    var kountaPromises = [];
    // if there are NO ORDERS then do not go to kounta!
    if (orders.models.length == 0) {
       return;
    }

    return utils.eachAsPromise(orders.models, function (order, i) {
      kounta_id = order.get('kounta_id');

      var kountaPromise = kountaRequest({
        url: config.kounta.apiBase + 'orders/' + kounta_id + '.json',
        method: 'GET'
      });
      kountaPromises.push(kountaPromise);
    },kountaPromises).then(function () {
      // var hashed_orders = hashItems(orders, 'id');
      return {kountaPromises: kountaPromises, orders: orders};
    });
  }).then(function (opt) {
    // opt will be undefined whern there are zero orders ...
    if (typeof(opt) === 'undefined') {
       return;
    }

    return Promise.map(opt.kountaPromises, function (kountaOrder) {
      var kounta_id = kountaOrder.id;
      var order = opt.orders.findWhere({kounta_id: kounta_id});
      var receivedOrderId = order.get('id');
      return {
        kitchenId: kountaOrder.site_id,
        orderId: receivedOrderId,
        id: receivedOrderId,
        deliveryWindowId: order.get('deliverywindow_id'),
        date: order.get('date'),
        status: Order.getOrderDescription(order.get('status')),
        sla: order.get('sla'),
        eta: order.get('eta'),
        orderNumber : kountaOrder.sale_number,
        orderItems: _.map(kountaOrder.lines, function (line, i) {
          return {menuItemId: line.product.id, quantity: line.quantity};
        }),
        promoCodeObj: {
          promoCode: order.get('promo_code'),
          isValid: order.get('isValid'),
          statusCode: order.get('statusCode'),
          discountAmount: order.get('discountAmount')
        }
      };
    });
  }).then(function (orders) {
    if (typeof(orders) === 'undefined') {
       var orders = [];
       res.json(orders);
    } else {
       res.json(orders);
    }
  }).catch(function(err) {
    return res.json(err.message);
  });
};

exports.readAllOrders = function (req, res) {
    var isCurrent = (req.query.current == "true" ? true : false);
    var getStatus = (req.query.getStatus == "true" ? true : false);
    var uid = null;
    var platform = (req.query.platform)?req.query.platform:false;

    if (isCurrent){
      if(req.query.user_id) uid = req.query.user_id;
    }else{
      var usertype= req.user.user.user_type;
      uid = req.user.user.id;
    }

    var fetchParams = {
      withRelated: [
        'user',
        'deliveryAddress',
        'orderStatusChanges',
        'menuItemOrders',
        'menuItems',
        'kitchen',
        'deliveryWindow'
      ]
    };
    var ordersQry = Order.forge().query(function (qb) {
      if(isCurrent){
        if(uid!=undefined){
          qb.where(function(){
            this.where('user_id', '=', uid);
            this.andWhere('status', '=', 303);
          });
          qb.orWhere(function(){
            this.where('user_id', '=', uid);
            this.andWhere('status', '=', 304);
          });
          qb.orWhere(function(){
            this.where('user_id', '=', uid);
            this.andWhere('status', '=', 400);
          });
        }
      }else{
        if(undefined != uid && usertype == 'sub_admin'){
          qb.join('kitchens', 'kitchens.id', '=', 'orders.kitchen_id');
          qb.where('kitchens.OwnedBy', '=', uid);
        }else if(undefined != uid && usertype == 'kitchen_manager'){
          qb.join('kitchens', 'kitchens.id', '=', 'orders.kitchen_id');
          qb.whereIn('status', [303, 304, 202, 203, 400]);
          qb.andWhere('kitchens.user_id', '=', uid);
        }else if(undefined != uid && uid!=1){
          qb.where('user_id', '=', uid);
        }
      }
      qb.orderBy('date', 'DESC');
    }).fetchAll(fetchParams).then(function(addy) {
      return addy;
    });
    ordersQry.then(function (orders) {
      if (orders.models.length == 0) {
        var orders = [];
        return orders;
      }else{
        if(!isCurrent){
          return Promise.map(orders.models, function (order) {
            var orderStatus = order.get('status');
            console.log("orderStatus");
            if(getStatus){
              if(orderStatus == 202){
                  var orderStatus = "Kitchen Received";
              } else if(orderStatus == 203){ 
                  var orderStatus = "Rejected By Kitchen";
              } else if(orderStatus == 303){ 
                  var orderStatus = "Driver Completed";
              } else if(orderStatus == 304){ 
                  var orderStatus = "Rejected By Driver";
              } else if(orderStatus == 400){ 
                  var orderStatus = "Completed";
              }

            } else {
              var ordermap;
              if(orderStatus == 100){
                  var orderStatus = "Order Received";
                  ordermap = 1;
              } else if(orderStatus == 202){ 
                  var orderStatus = "Preparing";
                  ordermap = 2;
              } else if(orderStatus == 204){ 
                  var orderStatus = "Preparing";
                  ordermap = 2;
              } else if(orderStatus == 301){ 
                  var orderStatus = "On The Way";
                  ordermap = 3;
              } else if(orderStatus == 308){ 
                  var orderStatus = "On The Way";
                  ordermap = 3;
              }
            }
              order.set("orderStatus", orderStatus);
              return order;
          });
        }
        return Promise.map(orders.models, function (order) {
          //if(Order.getOrderDescription(order.get('status')) == 303){
          if(order.get('status') == 303){
            var newStatus = "Complete";
          } else {
            var newStatus = "Reject";
          }

          
          return {
            kitchenId: order.get('kitchen_id'),
            orderId: order.get('id'),
            id: order.get('id'),
            deliveryWindowId: order.get('deliverywindow_id'),
            date: moment(order.get('date')).format('MMMM D,YYYY hh:mm A'),
            status: newStatus,
            
            sla: order.get('sla'),
            eta: order.get('eta'),
            orderNumber : order.get('id'),
            orderItems: _.map(order.relations.menuItemOrders.models, function (line, i){
              return {menuItemId: line.attributes.menuitem_id, quantity: line.attributes.quantity};
            }),
            promoCodeObj: {
              promoCode: order.get('promo_code'),
              isValid: order.get('isValid'),
              statusCode: order.get('statusCode'),
              totalAmount: order.get('totalAmount'),
              CurrencySymbol : "$",
              discountAmount: order.get('discountAmount'),
              finalAmount : parseInt(order.get('totalAmount'))-parseInt(order.get('discountAmount'))
            },
            deliveryAddress: order.relations.deliveryAddress
          };
        });
      }
    }).then(function (orders) {
      if(platform=="mobile"){
        res.json({ "PriviousOrder": orders, "ErrorCode":0, "ErrorMessage":"", "Succeeded":true});
      } else {
        if (typeof(orders) === 'undefined') {
           var orders = [];
           res.json(orders);
        } else {
           res.json(orders);
        }
      }
    }).catch(function(err) {
      if(platform=="mobile"){
        res.json({ "PriviousOrder": "", "ErrorCode":err.status, "ErrorMessage":err.message, "Succeeded":false});
      } else {
        return res.json(err.message);
      }
      
    });
};

exports.getDriverOrderList = function (req, res) {
    var isCurrent = (req.query.current == "true" ? true : false);
    var platform = (req.query.platform)?req.query.platform:false;
    var type = (req.query.type)?req.query.type:false;
    var uid = req.params.id;
    var fulfil_date = req.body.fulfil_date;
    
    var fetchParams = {
      withRelated: [
        'user',
        'deliveryAddress',
        'orderStatusChanges',
        'menuItemOrders',
        'menuItems',
        'kitchen',
        'deliveryWindow'
      ]
    };

    var ordersQry = Order.forge().query(function (qb) {
      qb.where('driver_id', '=', uid);
      qb.andWhere('fulfil_date', 'like',  '%'+moment(fulfil_date).format("YYYY-MM-DD")+'%');
      qb.andWhere('status', '=', 301);
      qb.andWhere('is_show_driver', '=', 1);
    console.log("qp");
      qb.orderBy('date', 'DESC');
    }).fetchAll(fetchParams).then(function(addy) {
      return addy;
    });
    ordersQry.then(function (orders) {
      console.log("orders");
      console.log(orders);
      if (orders.models.length == 0) {
        var orders = [];
        return orders;
      }else{
        if(!isCurrent){
           return orders;
        }
        return Promise.map(orders.models, function (order) {
          if(Order.getOrderDescription(order.get('status')) == 303){
            var newStatus = "Complete";
          } else {
            var newStatus = "Reject";
          }

          return {
            kitchenId: order.get('kitchen_id'),
            orderId: order.get('id'),
            id: order.get('id'),
            deliveryWindowId: order.get('deliverywindow_id'),
            date: order.get('date'),
            status: newStatus,
            sla: order.get('sla'),
            eta: order.get('eta'),
            orderNumber : order.get('id'),
            orderItems: _.map(order.relations.menuItemOrders.models, function (line, i){
              return {menuItemId: line.attributes.menuitem_id, quantity: line.attributes.quantity};
            }),
            promoCodeObj: {
              promoCode: order.get('promo_code'),
              isValid: order.get('isValid'),
              statusCode: order.get('statusCode'),
              totalAmount: order.get('totalAmount'),
              CurrencySymbol : "$",
              discountAmount: order.get('discountAmount'),
              finalAmount : parseInt(order.get('totalAmount'))-parseInt(order.get('discountAmount'))
            },
            deliveryAddress: order.relations.deliveryAddress
          };
        });
      }
    }).then(function (orders) {
      if(type=="driver"){
        res.json({ "DriverOrders": orders, "ErrorCode":0, "ErrorMessage":"", "Succeeded":true});
      } else if(platform=="mobile"){
        res.json({ "PriviousOrder": orders, "ErrorCode":0, "ErrorMessage":"", "Succeeded":true});
      } else {
        if (typeof(orders) === 'undefined') {
           var orders = [];
           res.json(orders);
        } else {
           res.json(orders);
        }
      }
    }).catch(function(err) {
      if(type=="DriverOrders"){
        res.json({ "PriviousOrder": "", "ErrorCode":err.status, "ErrorMessage":err.message, "Succeeded":false});
      } else if(platform=="mobile"){
        res.json({ "PriviousOrder": "", "ErrorCode":err.status, "ErrorMessage":err.message, "Succeeded":false});
      } else {
        return res.json(err.message);
      }
      
    });
};

exports.cashcodeorderssent = function(req, res){
  var orderData, KitchenData;
  return Order.forge({id: req.body.id}).fetch().then(function(data){
    if(data){
      orderData = data;
      return KitchenModel.forge({id: req.body.kitchen_id}).fetch().then(function(kitchenData){
        KitchenData = kitchenData;
        console.log("KitchenDataKitchenDataKitchenDataKitchenDataKitchenData")
        console.log(KitchenData);
        return User.forge({id: req.body.user_id}).fetch().then(function(userData){
          if(userData){
            var balance = JSON.parse(userData.get("balance"));
            console.log("req.body.kitchen_idreq.body.kitchen_id");
            console.log(req.body.kitchen_id);
            var indexOfBalance = balance.KW.kitchens.indexOf(req.body.kitchen_id);
            console.log(indexOfBalance);
            if(indexOfBalance == -1){
                balance.KW.kitchens.push(req.body.kitchen_id);
                console.log(balance);
                balance.KW.balance.push(req.body.cashbackAmount);
                console.log(balance);
                balance.KW.kitchenData.push({
                  image : KitchenData.get('logo'),
                  name : KitchenData.get('name')
                });
                console.log(balance);
                var TasitoWT = parseInt(balance.TW);
                TasitoWT += req.body.admin_cashback;
                balance.TW = TasitoWT;
            } else {
              var userBalence = parseInt(balance.KW.balance[indexOfBalance]);
              userBalence += req.body.cashbackAmount;
              balance.KW.balance[indexOfBalance] = userBalence;
              var TasitoWT = parseInt(balance.TW);
              TasitoWT += req.body.admin_cashback;
              balance.TW = TasitoWT;
            }
            balanceObj = JSON.stringify(balance);
            
            userData.save({
              balance : balanceObj
            }, {
              patch : true
            }).tap(function(userData){
              return userData;
            }).then(function(userData){
              orderData.save({
                is_cashback_done : 1
              }, {
                patch : true
              }).tap(function(userData){
                return userData;
              }).then(function(){
                //res.json({ "Data": "", "ErrorCode":200, "ErrorMessage":"Cashback sent to user.", "Succeeded":true});
                return { "Data": "", "ErrorCode":200, "ErrorMessage":"Cashback sent to user.", "Succeeded":true};
              });
            });
          } else {
            //res.json({ "Data": "", "ErrorCode":301, "ErrorMessage":"No user found.", "Succeeded":false});    
            return { "Data": "", "ErrorCode":301, "ErrorMessage":"No user found.", "Succeeded":false};
          }
        });
      });
    } else {
      //res.json({ "Data": "", "ErrorCode":300, "ErrorMessage":"No order found.", "Succeeded":false});
      return { "Data": "", "ErrorCode":300, "ErrorMessage":"No order found.", "Succeeded":false};
    }
  })
};

exports.cashcodeOrders = function (req, res) {
  var isCurrent = (req.query.current == "true" ? true : false);
    var uid = null;
    var platform = (req.query.platform)?req.query.platform:false;

    if (isCurrent){
      if(req.query.user_id) uid = req.query.user_id;
    }else{
      var usertype= req.user.user.user_type;
      uid = req.user.user.id;
    }

    var fetchParams = {
      withRelated: [
        'user',
        'deliveryAddress',
        'orderStatusChanges',
        'menuItemOrders',
        'menuItems',
        'kitchen',
        'deliveryWindow'
      ]
    };
    var ordersQry = Order.forge().query(function (qb) {
      if(isCurrent){
        if(uid!=undefined){
          qb.where(function(){
            this.where('user_id', '=', uid);
            this.andWhere('status', '=', 303);
          });
          qb.orWhere(function(){
            this.where('user_id', '=', uid);
            this.andWhere('status', '=', 304);
          });
          qb.orWhere(function(){
            this.where('user_id', '=', uid);
            this.andWhere('status', '=', 400);
          });
        }
      }else{
        if(undefined != uid && usertype == 'sub_admin'){
          qb.join('kitchens', 'kitchens.id', '=', 'orders.kitchen_id');
          qb.where(function(){
            this.where('kitchens.OwnedBy', '=', uid);
            this.andWhere('orders.is_cashback', '=', 1);
            this.andWhere('orders.status', '=', 303);
            this.andWhere('orders.is_cashback_done', '=', 0);
          });
          qb.orWhere(function(){
            this.where('kitchens.OwnedBy', '=', uid);
            this.andWhere('orders.is_cashback', '=', 1);
            this.andWhere('orders.status', '=', 400);
            this.andWhere('orders.is_cashback_done', '=', 0);
          });
        }else if(undefined != uid && usertype == 'kitchen_manager'){
          qb.join('kitchens', 'kitchens.id', '=', 'orders.kitchen_id');
          qb.where(function(){
            this.where('kitchens.user_id', '=', uid);
            this.andWhere('orders.is_cashback', '=', 1);
            this.andWhere('orders.status', '=', 303);
            this.andWhere('orders.is_cashback_done', '=', 0);
          });
          qb.orWhere(function(){
            this.where('kitchens.user_id', '=', uid);
            this.andWhere('orders.is_cashback', '=', 1);
            this.andWhere('orders.status', '=', 400);
            this.andWhere('orders.is_cashback_done', '=', 0);
          });
          /*qb.where('kitchens.user_id', '=', uid);
          qb.andWhere('orders.is_cashback', '=', 1);
          qb.andWhere('orders.status', '=', 303);
          qb.andWhere('orders.is_cashback_done', '=', 0);*/
        }else if(undefined != uid && uid!=1){
          qb.where('user_id', '=', uid);
          qb.andWhere('orders.is_cashback', '=', 1);
          qb.andWhere('orders.status', '=', 303);
          qb.andWhere('orders.is_cashback_done', '=', 0);
        }

      }
      qb.orderBy('date', 'DESC');
    }).fetchAll(fetchParams).then(function(addy) {
      return addy;
    });
    ordersQry.then(function (orders) {
      if (orders.models.length == 0) {
        var orders = [];
        return orders;
      }else{
        if(!isCurrent){
          return Promise.map(orders.models, function (order) {
              var orderStatus = order.get('status');
              console.log("orderStatus");
              var ordermap;
              if(orderStatus == 100){
                  var orderStatus = "Order Received";
                  ordermap = 1;
              } else if(orderStatus == 202){ 
                  var orderStatus = "Preparing";
                  ordermap = 2;
              } else if(orderStatus == 204){ 
                  var orderStatus = "Preparing";
                  ordermap = 2;
              } else if(orderStatus == 301){ 
                  var orderStatus = "On The Way";
                  ordermap = 3;
              } else if(orderStatus == 308){ 
                  var orderStatus = "On The Way";
                  ordermap = 3;
              }
              order.set("orderStatus", orderStatus);
              return order;
          });
        }
        return Promise.map(orders.models, function (order) {
          //if(Order.getOrderDescription(order.get('status')) == 303){
          if(order.get('status') == 303){
            var newStatus = "Complete";
          } else {
            var newStatus = "Reject";
          }



          return {
            kitchenId: order.get('kitchen_id'),
            orderId: order.get('id'),
            id: order.get('id'),
            deliveryWindowId: order.get('deliverywindow_id'),
            date: moment(order.get('date')).format('MMMM D,YYYY hh:mm A'),
            status: newStatus,
            
            sla: order.get('sla'),
            eta: order.get('eta'),
            orderNumber : order.get('id'),
            orderItems: _.map(order.relations.menuItemOrders.models, function (line, i){
              return {menuItemId: line.attributes.menuitem_id, quantity: line.attributes.quantity};
            }),
            promoCodeObj: {
              promoCode: order.get('promo_code'),
              isValid: order.get('isValid'),
              statusCode: order.get('statusCode'),
              totalAmount: order.get('totalAmount'),
              CurrencySymbol : "$",
              discountAmount: order.get('discountAmount'),
              finalAmount : parseInt(order.get('totalAmount'))-parseInt(order.get('discountAmount'))
            },
            deliveryAddress: order.relations.deliveryAddress
          };
        });
      }
    }).then(function (orders) {
      if(platform=="mobile"){
        res.json({ "PriviousOrder": orders, "ErrorCode":0, "ErrorMessage":"", "Succeeded":true});
      } else {
        if (typeof(orders) === 'undefined') {
           var orders = [];
           res.json(orders);
        } else {
           res.json(orders);
        }
      }
    }).catch(function(err) {
      if(platform=="mobile"){
        res.json({ "PriviousOrder": "", "ErrorCode":err.status, "ErrorMessage":err.message, "Succeeded":false});
      } else {
        return res.json(err.message);
      }
      
    });
};

exports.readLiveOrder = function (req, res) {
  var isCurrent = (req.query.current == "true" ? true : false);
  var uid = null, usertype = null;
  var platform = (req.query.platform)?req.query.platform:false;
  var kitchen_id = (req.query.kitchen_id)?req.query.kitchen_id:false;
  var finalOrderArray = {
    "orders" : [],
    "phoneNumbersArray" : []
  };
  if (isCurrent){
    if(req.query.user_id) uid = req.query.user_id;
    if(req.query.usertype) usertype = req.query.usertype;

  }else{
    if(req.query.user_id){
      uid = req.query.user_id;
      var usertype= 'kitchen_manager';
    } else {
      var usertype= req.user.user.user_type;
      uid = req.user.user.id;
    }
  }
  console.log(uid);
  console.log(usertype);


    var fetchParams = {
      withRelated: [
        'user',
        'driver_info',
        'deliveryAddress',
        'orderStatusChanges',
        'menuItemOrders',
        'menuItems',
        'kitchen',
        'deliveryWindow',
        'kitchenArea',
        'menuitemsCombos'
      ]
    };

    console.log(moment().format("YYYY-MM-DD"));

    var ordersQry = Order.forge().query(function (qb) {
      if(isCurrent){
        if(uid!=undefined){
          qb.where('user_id', '=', uid);
          qb.andWhere('date', '>', moment().startOf('day').format());
        }
      }else{
        if(undefined != uid && usertype == 'sub_admin'){
          qb.join('kitchens', 'kitchens.id', '=', 'orders.kitchen_id');
          qb.where('kitchens.OwnedBy', '=', uid);
          qb.andWhere('date', 'like',  '%'+moment().format("YYYY-MM-DD")+'%');
          qb.andWhereNot({'status':203});
          qb.andWhereNot({'status':400});
          qb.andWhereNot({'status':304});
          //qb.andWhere('date', '>', moment().startOf('day').format());
        } else if(undefined != uid && usertype == 'chef'){
          qb.join('kitchens', 'kitchens.id', '=', 'orders.kitchen_id');
          qb.whereIn('status', [100, 202]);
          qb.andWhere('kitchens.OwnedBy', '=', req.user.user.subadmin_id);
          qb.andWhere('date', 'like',  '%'+moment().format("YYYY-MM-DD")+'%');
          //qb.andWhere('date', '>', moment().startOf('day').format());
        } else if(undefined != uid && usertype == 'kitchen_manager'){
          qb.join('kitchens', 'kitchens.id', '=', 'orders.kitchen_id');
          qb.where('kitchens.user_id', '=', uid);
          qb.andWhere('date', 'like',  '%'+moment().format("YYYY-MM-DD")+'%');
          //qb.andWhereNot({'status':303});
          qb.andWhereNot({'status':203});
          qb.andWhereNot({'status':400});
          qb.andWhereNot({'status':903});
          //qb.andWhereNot({'status':304});
          //qb.andWhere('date', '>', moment().startOf('day').format());
        }else if(undefined != uid && uid!=1){
          qb.where('user_id', '=', uid);
          qb.andWhere('date', 'like',  '%'+moment().format("YYYY-MM-DD")+'%');
          //qb.andWhere('date', '>', moment().startOf('day').format());
        }
      }
      qb.orderBy('date', 'DESC');

        
    }).fetchAll(fetchParams).then(function(addy) {
      return addy;
    });

    ordersQry.then(function (orders) {
      if (orders.models.length == 0) {
        var orders = [];
        return orders;
        //res.json(orders);
      }else{
        if(!isCurrent){
           return Promise.map(orders.models, function (order) {
              var orderStatus = order.get('status');
              console.log("orderStatus");
              var ordermap;
              if(orderStatus == 100){
                  var orderStatus = "Order Received";
                  ordermap = 1;
              } else if(orderStatus == 202){ 
                  var orderStatus = "Preparing";
                  ordermap = 2;
              } else if(orderStatus == 204){ 
                  var orderStatus = "Preparing";
                  ordermap = 2;
              } else if(orderStatus == 301){ 
                  var orderStatus = "On The Way";
                  ordermap = 3;
              } else if(orderStatus == 308){ 
                  var orderStatus = "On The Way";
                  ordermap = 3;
              } else if(orderStatus == 303){ 
                  var orderStatus = "Delivered";
                  ordermap = 4;
              } else if(orderStatus == 400){ 
                  var orderStatus = "Complete";
                  ordermap = 5;
              } else if(orderStatus == 304){ 
                  var orderStatus = "Rejected by driver";
                  ordermap = 6;
              }
              order.set("orderStatus", orderStatus);
              order.set("credit_type", JSON.parse(order.get("credit_type")));
              return order;
          });
        } else {
          return Promise.map(orders.models, function (order) {
            return {
              kitchenId: order.get('kitchen_id'),
              orderId: order.get('id'),
              id: order.get('id'),
              deliveryWindowId: order.get('deliverywindow_id'),
              date: order.get('date'),
              status: Order.getOrderDescription(order.get('status')),
              sla: order.get('sla'),
              eta: order.get('eta'),
              orderNumber : order.get('id'),
              orderItems: _.map(order.relations.menuItemOrders.models, function (line, i){
                return {menuItemId: line.attributes.menuitem_id, quantity: line.attributes.quantity};
              }),
              promoCodeObj: {
                promoCode: order.get('promo_code'),
                isValid: order.get('isValid'),
                statusCode: order.get('statusCode'),
                discountAmount: order.get('discountAmount')
              }
            };
          });
        }
      }
    }).then(function(orders){
      finalOrderArray.orders = orders;
      return finalOrderArray;
    }).then(function(orders){
      var userQry = User.forge().query(function(qp){
        qp.distinct('users.id');
        qp.join('orders', 'users.id', '=', 'orders.user_id');
        qp.where('orders.status', '=', '303');
      }).fetchAll();

      return userQry.then(function(numberData){
        finalOrderArray.phoneNumbersArray = numberData;
        return finalOrderArray;
      }).then(function(data){
        var newArray = []; 
        return Promise.map(finalOrderArray.phoneNumbersArray.models, function(item){
           return item.get('id');
        });
      }).then(function(data){
        finalOrderArray.phoneNumbersArray = data;
        return finalOrderArray;
      });
    }).then(function(orders){
      return Promise.map(finalOrderArray.orders, function(items){
        if(finalOrderArray.phoneNumbersArray.indexOf(items.get("user_id")) == -1){
          items.set("is_new", 0);
        } else {
          items.set("is_new", 1);
        }
        return items;
      });
    }).then(function (orders) {
      if (typeof(orders) === 'undefined') {
         var orders = [];
         res.json(orders);
      } else {
         res.json(finalOrderArray.orders);
      }
    }).catch(function(err) {
      return res.json(err.message);
    });
};

exports.readTodayOrder = function (req, res) {
  var isCurrent = (req.query.current == "true" ? true : false);
  var getStatus = (req.query.getStatus == "true" ? true : false);
  var uid = null, usertype = null;
  var platform = (req.query.platform)?req.query.platform:false;
  var kitchen_id = (req.query.kitchen_id)?req.query.kitchen_id:false
  if (isCurrent){
    if(req.query.user_id) uid = req.query.user_id;
    if(req.query.usertype) usertype = req.query.usertype;

  }else{
    var usertype= req.user.user.user_type;
    uid = req.user.user.id;
  }


    var fetchParams = {
      withRelated: [
        'user',
        'driver_info',
        'deliveryAddress',
        'orderStatusChanges',
        'menuItemOrders',
        'menuItems',
        'kitchen',
        'deliveryWindow',
        'kitchenArea'
      ]
    };

    console.log(req.user.user);
    console.log(moment().format("YYYY-MM-DD"));

    var ordersQry = Order.forge().query(function (qb) {
      if(isCurrent){
        if(uid!=undefined){
          qb.where('user_id', '=', uid);
          qb.andWhere('date', '>', moment().startOf('day').format());
        }
      }else{
        if(undefined != uid && usertype == 'sub_admin'){
          qb.join('kitchens', 'kitchens.id', '=', 'orders.kitchen_id');
          qb.where('kitchens.OwnedBy', '=', uid);
          qb.andWhere('date', 'like',  '%'+moment().format("YYYY-MM-DD")+'%');
          //qb.andWhere('date', '>', moment().startOf('day').format());
        } else if(undefined != uid && usertype == 'chef'){
          qb.join('kitchens', 'kitchens.id', '=', 'orders.kitchen_id');
          qb.whereIn('status', [100, 202]);
          qb.andWhere('kitchens.OwnedBy', '=', req.user.user.subadmin_id);
          qb.andWhere('date', 'like',  '%'+moment().format("YYYY-MM-DD")+'%');
          //qb.andWhere('date', '>', moment().startOf('day').format());
        } else if(undefined != uid && usertype == 'kitchen_manager'){
          qb.join('kitchens', 'kitchens.id', '=', 'orders.kitchen_id');
          qb.where('kitchens.user_id', '=', uid);
          qb.andWhere('date', 'like',  '%'+moment().format("YYYY-MM-DD")+'%');
          //qb.andWhere('date', '>', moment().startOf('day').format());
        } else if(undefined != uid && uid!=1){
          qb.where('user_id', '=', uid);
          qb.andWhere('date', 'like',  '%'+moment().format("YYYY-MM-DD")+'%');
          //qb.andWhere('date', '>', moment().startOf('day').format());
        }
      }
      qb.orderBy('date', 'DESC');

        
    }).fetchAll(fetchParams).then(function(addy) {
      return addy;
    });
    ordersQry.then(function (orders) {
      if (orders.models.length == 0) {
        var orders = [];
        return orders;
        //res.json(orders);
      }else{
        if(!isCurrent){
           /*return Promise.map(orders.models, function (order) {
              var orderStatus = order.get('status');
              console.log("orderStatus");
              var ordermap;
              if(orderStatus == 100){
                  var orderStatus = "Order Received";
                  ordermap = 1;
              } else if(orderStatus == 202){ 
                  var orderStatus = "Preparing";
                  ordermap = 2;
              }  else if(orderStatus == 203){ 
                  var orderStatus = "Rejected";
                  ordermap = 2;
              } else if(orderStatus == 204){ 
                  var orderStatus = "Preparing";
                  ordermap = 2;
              } else if(orderStatus == 301){ 
                  var orderStatus = "On The Way";
                  ordermap = 3;
              } else if(orderStatus == 308){ 
                  var orderStatus = "On The Way";
                  ordermap = 3;
              } else if(orderStatus == 303){ 
                  var orderStatus = "Delivered";
                  ordermap = 4;
              } else if(orderStatus == 400){ 
                  var orderStatus = "Complete";
                  ordermap = 4;
              }
              order.set("orderStatus", orderStatus);
              return order;
          });*/
          return Promise.map(orders.models, function (order) {
            var orderStatus = order.get('status');
            console.log("orderStatus");
            if(getStatus){
              if(orderStatus == 100){
                  var orderStatus = "Order Received";
                  ordermap = 1;
              } else if(orderStatus == 202){ 
                  var orderStatus = "Kitchen Received";
                  ordermap = 2;
              }  else if(orderStatus == 203){ 
                  var orderStatus = "Rejected By Kitchen";
                  ordermap = 2;
              } else if(orderStatus == 204){ 
                  var orderStatus = "Preparing";
                  ordermap = 2;
              } else if(orderStatus == 301){ 
                  var orderStatus = "On The Way";
                  ordermap = 3;
              } else if(orderStatus == 308){ 
                  var orderStatus = "On The Way";
                  ordermap = 3;
              } else if(orderStatus == 303){ 
                  var orderStatus = "Driver Completed";
                  ordermap = 4;
              } else if(orderStatus == 400){ 
                  var orderStatus = "Completed";
                  ordermap = 4;
              } else if(orderStatus == 304){ 
                  var orderStatus = "Rejected By Driver";
              } else if(orderStatus == 903){
                if(order.get("rejectBy") == 1){
                  var orderStatus = "Rejected by kitchen.";
                } else if(order.get("rejectBy") == 2){
                  var orderStatus = "Rejected By Driver";
                }
              }
            } else {
              var ordermap;
              if(orderStatus == 100){
                  var orderStatus = "Order Received";
                  ordermap = 1;
              } else if(orderStatus == 202){ 
                  var orderStatus = "Preparing";
                  ordermap = 2;
              }  else if(orderStatus == 203){ 
                  var orderStatus = "Rejected";
                  ordermap = 2;
              } else if(orderStatus == 204){ 
                  var orderStatus = "Preparing";
                  ordermap = 2;
              } else if(orderStatus == 301){ 
                  var orderStatus = "On The Way";
                  ordermap = 3;
              } else if(orderStatus == 308){ 
                  var orderStatus = "On The Way";
                  ordermap = 3;
              } else if(orderStatus == 303){ 
                  var orderStatus = "Delivered";
                  ordermap = 4;
              } else if(orderStatus == 400){ 
                  var orderStatus = "Complete";
                  ordermap = 4;
              }
            }
            order.set("orderStatus", orderStatus);
            return order;
          });
        } else {
          return Promise.map(orders.models, function (order) {
            return {
              kitchenId: order.get('kitchen_id'),
              orderId: order.get('id'),
              id: order.get('id'),
              deliveryWindowId: order.get('deliverywindow_id'),
              date: order.get('date'),
              status: Order.getOrderDescription(order.get('status')),
              sla: order.get('sla'),
              eta: order.get('eta'),
              orderNumber : order.get('id'),
              orderItems: _.map(order.relations.menuItemOrders.models, function (line, i){
                return {menuItemId: line.attributes.menuitem_id, quantity: line.attributes.quantity};
              }),
              promoCodeObj: {
                promoCode: order.get('promo_code'),
                isValid: order.get('isValid'),
                statusCode: order.get('statusCode'),
                discountAmount: order.get('discountAmount')
              }
            };
          });
        }
      }
    }).then(function (orders) {
      if (typeof(orders) === 'undefined') {
         var orders = [];
         res.json(orders);
      } else {
         res.json(orders);
      }
    }).catch(function(err) {
      return res.json(err.message);
    });
};

exports.assigneDriverList = function (req, res) {
  var isCurrent = (req.query.current == "true" ? true : false);
  var uid = null, usertype = null;
  var platform = (req.query.platform)?req.query.platform:false;
  var kitchen_id = (req.query.kitchen_id)?req.query.kitchen_id:false;
  var driver_idArray = [];
  var usertype = "kitchen_manager";
  

  if (isCurrent){
    if(req.query.user_id) uid = req.query.user_id;
  }else{
    uid = req.user.user.id;
  }

  var fetchParams = {
    withRelated: [
      'user'
    ]
  };
console.log(uid);
  var ordersQry = Order.forge().query(function (qb) {
    if(isCurrent){
      if(uid!=undefined){
        qb.where('user_id', '=', uid);
        qb.andWhere('date', '>', moment().startOf('day').format());
      }
    }else{
      if(undefined != uid && usertype == 'kitchen_manager'){
        qb.join('kitchens', 'kitchens.id', '=', 'orders.kitchen_id');
        //qb.whereNotIn('status', [301, 302, 304, 305, 306, 307, 308]);
        //qb.whereNot('status', '=', 303);
        //qb.whereNot('status', '=', 304);
        qb.andWhereNot('driver_id', '=', 0);
        qb.andWhere('kitchens.user_id', '=', uid);
        qb.andWhere('date', 'like',  '%'+moment().format("YYYY-MM-DD")+'%');
        qb.groupBy('driver_id');
        //qb.andWhere('date', '>', moment().startOf('day').format());
      } else if(undefined != uid && uid!=1){
        qb.where('user_id', '=', uid);
        qb.andWhere('date', 'like',  '%'+moment().format("YYYY-MM-DD")+'%');
        //qb.andWhere('date', '>', moment().startOf('day').format());
      }
    }
    qb.orderBy('date', 'DESC'); 
  }).fetchAll(fetchParams).then(function(addy) {

    return addy;
  });

  ordersQry.then(function (orders) {
    if (orders.models.length == 0) {
      var orders = [];
      return orders;
    }else{
      return Promise.map(orders.models, function (order) {
        driver_idArray.push(order.get('driver_id'));
        return {
          driver_id: order.get('driver_id')
        };
      });
      //return orders;
    }
  }).then(function(data){
    console.log(driver_idArray);
    var userQry = User.forge().query(function(qp){
        //qp.whereNotIn('id', driver_idArray);
        if(req.query.subadmin_id!=undefined)
        qp.andWhere({subadmin_id: req.query.subadmin_id});
        else
        qp.andWhere({subadmin_id: req.user.user.subadmin_id});
        qp.andWhere({user_type: "driver"});
    }).fetchAll().then(function(addy) {
      return addy;
    });

     return userQry.then(function(user){
        console.log("assigneDriverList======================");
      console.log(user);
      if (user.models.length == 0) {
        var user = [];
        return user;
      }else{
        return user;
      }
    });
  }).then(function (orders) {
    if (typeof(orders) === 'undefined') {
       var orders = [];
       res.json({"result":orders});
    } else {
       res.json({"result":orders});
    }
  }).catch(function(err) {
    return res.json(err.message);
  });
};

exports.count = function (req, res) {
  var isCurrent = (req.query.current == "true" ? true : false);
  var uid = null;
  if (isCurrent){
    if(req.query.user_id) uid = req.query.user_id;
  }else{
    uid = req.user.user.id;
  }
  var ordersQry = Order.forge().query(function (qb) {
    if (isCurrent && uid!=undefined){
      qb.where({user_id: uid})
        .andWhere('status', '<>', Order.status.CANCELED)
        .andWhere('status', '<>', Order.status.COMPLETE)
        .andWhere('date', '>', moment().startOf('day').format());
    } else if (undefined != uid && uid != 1){
         qb.join('kitchens', 'kitchens.id', '=', 'orders.kitchen_id');
         qb.where('kitchens.user_id', '=', uid);      
    }
  });

  ordersQry.count().then(function (cnt) {
    res.json({count: cnt})
  });
}

exports.getNewOrderCount = function (req, res) {
  var isCurrent = (req.query.current == "true" ? true : false);
  var uid = null;
  if (isCurrent){
    if(req.query.user_id) uid = req.query.user_id;
  }else{
    uid = req.user.user.id;
  }
  var ordersQry = Order.forge().query(function (qb) {
    if (isCurrent && uid!=undefined){
      qb.where({user_id: uid})
        .andWhere('status', '<>', Order.status.CANCELED)
        .andWhere('status', '<>', Order.status.COMPLETE)
        //.andWhere('date', '>', moment().startOf('day').format())
        .andWhere({'is_read': 0});
    } else if (undefined != uid && uid != 1){
         qb.join('kitchens', 'kitchens.id', '=', 'orders.kitchen_id');
         qb.where('kitchens.user_id', '=', uid); 
         qb.andWhere({'is_read': 0});     
    }
  });

  ordersQry.count().then(function (cnt) {
    res.json({count: cnt})
  });
}

exports.changeStatsToRead = function (req, res) {
  var isCurrent = (req.query.current == "true" ? true : false);
  var uid = null;
  if (isCurrent){
    if(req.query.user_id) uid = req.query.user_id;
  }else{
    uid = req.user.user.id;
  }

  Order.forge()
  .query(function(qp){
    qp.where({
      "is_read": 0
    });
  }).fetchAll().then(function(data){
    return Promise.all(data.models).each(function(item){
      item.save({
        "is_read": 1
      });
    });
  }).then(function(data){
    res.json({"data":"", "Succeeded": true, "ErrorMessage":"Status Changed.", "ErrorCode": 200});
  }).catch(function(err){
    res.json({"data":"", "Succeeded": false, "ErrorMessage":err.message, "ErrorCode": err.status});
  });
}

/**
 * @param su - true if tryingt to access via internal key
 */
exports.find = function (req, res) {
  console.log(req.params.id);
  var Platform = (req.query.platform)?req.query.platform:false;
  console.log(Platform);

    if(Platform){
      var fetchParams = {
        withRelated: [
          'user',
          'deliveryAddress',
          'orderStatusChanges',
          'menuItemOrders',
          'menuItems',
          'kitchen',
          'deliveryWindow'
        ]
      };
    } else {
      var fetchParams = {
        withRelated: [
          'user',
          'Address',
          'deliveryAddress',
          'orderStatusChanges',
          'menuItemOrders',
          'menuItems',
          'oredritems',
          'kitchen',
          'deliveryWindow'
        ]
      };
    }


    var ordersQry = Order.forge().query(function (qb) {
      if(Platform){
        qb.whereIn('status', [100, 202, 204, 301, 308]);
        //qb.whereIn('status', [100, 301, 202, 308]);
        qb.andWhere({user_id: req.params.id})
      } else {
        qb.where({id: req.params.id})
      }
    }).fetchAll(fetchParams).then(function(addy) {
      return addy;
    });
    ordersQry.then(function(orders){
      if(Platform == "mobile"){
        return Promise.map(orders.models, function (order) {
          //var orderStatus = Order.getOrderDescription(order.get('status'));
          var orderStatus = order.get('status');
          console.log(orderStatus);
          var ordermap;
          if(orderStatus == 100){
            var newStatus = "Order Received";
            ordermap = 1;
          } else if(orderStatus == 202){ 
            var newStatus = "Preparing";
            ordermap = 2;
          } else if(orderStatus == 204){ 
            var newStatus = "Preparing";
            ordermap = 2;
          } else if(orderStatus == 301){ 
            var newStatus = "On The Way";
            ordermap = 3;
          } else if(orderStatus == 308){ 
            var newStatus = "On The Way";
            ordermap = 3;
          }

          return {
            kitchenId: order.get('kitchen_id'),
            orderId: order.get('id'),
            id: order.get('id'),
            deliveryWindowId: order.get('deliverywindow_id'),
            date: moment(order.get('date')).format('MMMM D,YYYY hh:mm A'),
            status: newStatus,
            ordermap: ordermap,
            sla: order.get('sla'),
            eta: order.get('eta'),
            orderNumber : order.get('id'),
            orderItems: _.map(order.relations.menuItemOrders.models, function (line, i){
              return {menuItemId: line.attributes.menuitem_id, quantity: line.attributes.quantity};
            }),
            promoCodeObj: {
              promoCode: order.get('promo_code'),
              isValid: order.get('isValid'),
              statusCode: order.get('statusCode'),
              totalAmount: order.get('totalAmount'),
              CurrencySymbol : "$",
              discountAmount: order.get('discountAmount'),
              finalAmount : parseInt(order.get('totalAmount'))-parseInt(order.get('discountAmount'))
            },
            deliveryAddress: order.relations.deliveryAddress
          };
        });
      } else {
        return Promise.map(orders.models, function (order) {
          console.log(order.relations.user);
          var orderStatus = order.get('status');
          console.log(orderStatus);
          var ordermap;
          if(orderStatus == 100){
            var newStatus = "Order Received";
            ordermap = 1;
          } else if(orderStatus == 202){ 
            var newStatus = "Preparing";
            ordermap = 2;
          } else if(orderStatus == 204){ 
            var newStatus = "Preparing";
            ordermap = 2;
          } else if(orderStatus == 301){ 
            var newStatus = "On The Way";
            ordermap = 3;
          } else if(orderStatus == 308){ 
            var newStatus = "On The Way";
            ordermap = 3;
          }
          return {
              id: (order.get('id'))?order.get('id'):"",
              user_id: (order.get('user_id'))?order.get('user_id'):"",
              driver_id: (order.get('driver_id'))?order.get('driver_id'):"",
              date: (order.get('date'))?order.get('date'):"",
              delivery_address_id: (order.get('delivery_address_id'))?order.get('delivery_address_id'):"",
              deliverywindow_id: (order.get('deliverywindow_id'))?order.get('deliverywindow_id'):"",
              kounta_id: (order.get('kounta_id'))?kounta_id:"",
              sla: (order.get('sla'))?order.get('sla'):"",
              status: (order.get('status'))?order.get('status'):"",
              newStatus : newStatus,
              charge_id: (order.get('charge_id'))?order.get('charge_id'):"",
              promo_code: (order.get('promo_code'))?order.get('promo_code'):"",
              mealtype: (order.get('mealtype'))?order.get('mealtype'):"",
              kounta_order_number: (order.get('kounta_order_number'))?order.get('kounta_order_number'):"",
              eta: (order.get('eta'))?order.get('eta'):"",
              fulfil_date: (order.get('fulfil_date'))?order.get('fulfil_date'):"",
              kitchen_id: (order.get('kitchen_id'))?order.get('kitchen_id'):"",
              isValid: (order.get('isValid'))?order.get('isValid'):"",
              statusCode: (order.get('statusCode'))?order.get('statusCode'):"",
              discountAmount: (order.get('discountAmount'))?order.get('discountAmount'):"",
              totalAmount: (order.get('totalAmount'))?order.get('totalAmount'):"",
              creditApplied: (order.get('creditApplied'))?order.get('creditApplied'):"",
              user: order.relations.user,
              Address: order.relations.Address,
              deliveryAddress: order.relations.deliveryAddress,
              orderStatusChanges: _.map(order.relations.orderStatusChanges.models, function (line, i){
                return line;
              }),
              menuItemOrders: _.map(order.relations.menuItemOrders.models, function (line, i){
                return line;
              }),
              menuItems: _.map(order.relations.menuItems.models, function (line, i){
                return line;
              }),
              oredritems: _.map(order.relations.oredritems.models, function (line, i){
                return line;
              }),
              kitchen: order.relations.kitchen,
              deliveryWindow: _.map(order.relations.deliveryWindow.models, function (line, i){
                return line;
              })
          }
        });
      }
    }).then(function (orders) {
      // if there are NO ORDERS then do not go to kounta!
      if(Platform){
        res.json({ "OrderDetails": orders, "ErrorCode":0, "ErrorMessage":"", "Succeeded":true});
      } else {
        if (orders.length == 0) {
          var orders = [];
          res.json(orders);
        }
        res.json(orders);
      }
    }).catch(function(err) {
      if(Platform){
        res.json({ "OrderDetails": "", "ErrorCode":err.status, "ErrorMessage":err.message, "Succeeded":false});
      } else {
        return res.json(err.message);
      }
    });
};

/**
 * @param su - true if tryingt to access via internal key
 */
exports.findOrdersByUserID = function (req, res) {
  console.log(req.params.id);
    var fetchParams = {
      withRelated: [
        'user',
        'deliveryAddress',
        'orderStatusChanges',
        'menuItemOrders',
        'menuItems',
        'kitchen',
        'deliveryWindow'
      ]
    };
    var ordersQry = Order.forge().query(function (qb) {
        //qb.join('kitchens', 'kitchens.id', '=', 'orders.kitchen_id');
        qb.where({user_id: req.params.id})
    }).fetchAll(fetchParams).then(function(addy) {
      return addy;
    });
    ordersQry.then(function (orders) {
      // if there are NO ORDERS then do not go to kounta!
      if (orders.models.length == 0) {
        var orders = [];
        res.json(orders);
      }
      res.json(orders);
    }).catch(function(err) {
      return res.json(err.message);
    });
};

exports.orderStatus = function (req, res) {
  var order_id = req.params.id;
  var kountaRequest = createOauth2client(config.kounta.auth);

  var qry = Order.forge({id: order_id}).fetch();

  return qry.then(function (fOrder) {
    if (!fOrder) {
      logger.debug(scriptName, 'Order not found');
      return errors.returnError({
        code: 404,
        message: 'not found'
      }, res);
    }

    var kountaPromise = kountaRequest({
      url: config.kounta.apiBase + 'orders/' + fOrder.get('kounta_id') + '.json',
      method: 'GET'
    });

    return kountaPromise.then(function (order) {
      return  {
        kitchenId: order.site_id,
        orderId: order_id,
        deliveryWindowId: fOrder.get('deliverywindow_id'),
        date: fOrder.get('date'),
        status: Order.getOrderDescription(fOrder.get('status')),
        sla: fOrder.get('sla'),
        eta: fOrder.get('eta'),
        orderNumber : fOrder.get('kounta_order_number')
      }
    });
  }).then(function (result) {
    return res.json(result);
  }).catch(function (err) {
    return res.status(500).json({error: err.message});
  });
};

exports.kitchenServiceOrderStatusChangedCallback = function(req, res){
  logger.info(scriptName, 'order ' + req.params.id +' has status changed');
  Order.forge({id : req.params.id}).fetch().then(function(order){
    return order.set('status', Order.status.KITCHEN_COMPLETE).save(null);
  }).then(function(){
    return res.status(200).send();
  });

};

// Inactive orders from the list
exports.driverInactive = function(req, res){
  var body = req.body;

  Promise.all(body.OrderList).each(function(item){
    return Order.forge({id: item.id}).fetch().then(function (order) {
      return order.save({
        is_show_driver: 0
      }, {patch: true});
    }).then(function (result) {
      return result;
    }).catch(function (err) {
      return res.status(500).json({error: err.message});
    });
  }).then(function(){
    res.json({"OrderInactvie": "", "ErrorCode":200, "ErrorMessage":"Order inactive successfully for the driver.", "Succeeded":true});
  }).catch(function (err) {
    return res.status(500).json({error: err.message});
  });
}

//Driver Started
exports.delete = function (req, res) {
  return Order.forge({id: req.params.id}).fetch().then(function (order) {
      
  }).then(function (result) {
    Order.forge({id: req.params.id})
      .fetch({require: true})
      .then(function (order) {
        order.destroy()
        .then(function () {
          console.log(12);
          res.json({error: true, message: 'Order successfully deleted'});
        })
        .catch(function (err) {
          console.log(121);
          res.status(500).json({error: true,message: err.message});
        });
      })
      .catch(function (err) {
        res.status(500).json({error: true, message: err.message});
      });
    //res.status(201);
    //return res.end();
  }).catch(function (err) {
    console.log(1212);
    return res.status(500).json({error: err.message});
  });
};

//Driver Started
exports.onroute = function (req, res) {
  return Order.forge({id: req.params.id}).fetch().then(function (order) {

    if (order.get('status') != Order.status.KITCHEN_COMPLETE) {
      throw new Error("State Error")
    }

    return order.save({
      status: Order.status.DELIVERY_ONROUTE
    }, {patch: true});
  }).then(function (result) {
    res.status(201);
    return res.end();
  }).catch(function (err) {
    return res.status(500).json({error: err.message});
  });
};

//Kitchen rejected
exports.rejected = function (req, res) {
  var phonenumber = req.body.phonenumber;
  return Order.forge({id: req.params.id}).fetch().then(function (order) {
    console.log((order.get('status') != Order.status.KITCHEN_ACCEPTED));
    console.log((order.get('status') != Order.status.KITCHEN_REJECTED));
    console.log((order.get('status') != Order.status.KITCHEN_PENDING));
    console.log((order.get('status') != Order.status.CREATED));

    console.log();

    if (order.get('status') != Order.status.KITCHEN_ACCEPTED && order.get('status') != Order.status.KITCHEN_PENDING && order.get('status') != Order.status.CREATED) {
      throw new Error("State Error")
    }

    /*if (order.get('status') != Order.status.DELIVERY_ONROUTE) {
      throw new Error("State Error")
    }*/

    return order.save({
      status: Order.status.KITCHEN_REJECTED,
      comments: req.body.comments,
      driver_id : 0,
      rejectBy: 1
    }, {patch: true});
  }).then(function(result){
    var order = result;
    var orderStatus = order.get('status');
    console.log("orderStatus");
    
    var ordermap;
    if(orderStatus == 100){
        var orderStatus = "Order Received";
        ordermap = 1;
    } else if(orderStatus == 202){ 
        var orderStatus = "Preparing";
        ordermap = 2;
    } else if(orderStatus == 204){ 
        var orderStatus = "Preparing";
        ordermap = 2;
    } else if(orderStatus == 301){ 
        var orderStatus = "On The Way";
        ordermap = 3;
    } else if(orderStatus == 308){ 
        var orderStatus = "On The Way";
        ordermap = 3;
    } else if(orderStatus == 303){ 
        var orderStatus = "Delivered";
        ordermap = 4;
    } else if(orderStatus == 400){ 
        var orderStatus = "Complete";
        ordermap = 5;
    }
    order.set("orderStatus", orderStatus);
    return order;
  }).then(function (result) {
    var messageString = "Sorry! We are not able to serve your order right now.";
    if(result.get("changeTo") == 1){
      var siteUrl = smsHelper.makeUrl(phonenumber, messageString, true);
    } else {
      var siteUrl = smsHelper.makeUrl(phonenumber, messageString);  
    }
    request(siteUrl, function(error, response, body) {  
    //request("http://apivm.valuemobo.com/SMS/SMS_ApiKey.asmx/SMS_APIKeyNUC?apiKey=25EJ1QKsnIKh3pT&cellNoList="+phonenumber+"&msgText=Sorry! We are not able to serve your order right now.&senderId=yumCKC", function(error, response, body) {  
      return res.status(201).json({data: result});
    });
  }).catch(function (err) {
    return res.status(500).json({error: err.message});
  });
}

//Kitchen checked order
exports.pending = function (req, res) {
  return Order.forge({id: req.params.id}).fetch().then(function (order) {
    console.log(order);
    if ((order.get('status') != Order.status.CREATED)) {
      throw new Error("State Error")
    }

    return order.save({
      status: Order.status.KITCHEN_PENDING
    }, {patch: true});
  }).then(function (result) {
    return res.status(201).json({data: result});
  }).catch(function (err) {
    return res.status(500).json({error: err.message});
  });
}

//Kitchen accpected
exports.processed = function (req, res) {
  var timeTaken = req.body.timeTaken;
  var phonenumber = req.body.phonenumber;
  var gettedOrder;
  return Order.forge({id: req.params.id}).fetch().then(function (order) {
    console.log(order);
    gettedOrder = order;
    if ((order.get('status') != Order.status.CREATED && order.get('status') != Order.status.KITCHEN_PENDING)) {
      throw new Error("State Error")
    }

    var orderSplit = order.get("date").split(" ");
    var orderTime = orderSplit[1].split(":");
    var mm = parseInt(orderTime[1])+30+parseInt(timeTaken);

    if(mm>=60){
      mm = mm-60;
      orderTime[0] = parseInt(orderTime[0])+1;
      if(mm == 0){
        orderTime[1] = '00';
      } else {
        if(mm < 10){
          orderTime[1] = "0"+mm;
        } else {
          orderTime[1] = mm; 
        }
      };
    } else {
      orderTime[1] = mm;
    }
    
  return order.save({
      status: Order.status.KITCHEN_ACCEPTED,
      expected_delivary_time: orderSplit[0]+" "+orderTime.join(":"),
      ttm: timeTaken
      //status: Order.status.DELIVERY_ONROUTE
    }, {patch: true});
  }).then(function(result){
    var order = result;
    var orderStatus = order.get('status');
    console.log("orderStatus");
    
    var ordermap;
    if(orderStatus == 100){
        var orderStatus = "Order Received";
        ordermap = 1;
    } else if(orderStatus == 202){ 
        var orderStatus = "Preparing";
        ordermap = 2;
    } else if(orderStatus == 204){ 
        var orderStatus = "Preparing";
        ordermap = 2;
    } else if(orderStatus == 301){ 
        var orderStatus = "On The Way";
        ordermap = 3;
    } else if(orderStatus == 308){ 
        var orderStatus = "On The Way";
        ordermap = 3;
    } else if(orderStatus == 303){ 
        var orderStatus = "Delivered";
        ordermap = 4;
    } else if(orderStatus == 400){ 
        var orderStatus = "Complete";
        ordermap = 5;
    }
    order.set("orderStatus", orderStatus);
    return order;
  }).then(function (result) {
    return UsersService.findByMobile(phonenumber).then(function(data){
      if(data!=null){
        var finalTime = timeTaken+30;
        var messageString = "Dear "+data.get("firstname")+" , Your Order "+req.params.id+" with CKC is in process. COD Amount Rs. "+gettedOrder.get("totalAmount")+" . Expt. delivery Time : "+finalTime+" minutes.";
        
        if(gettedOrder.get("changeTo") == 1){
          var siteUrl = smsHelper.makeUrl(phonenumber, messageString, true);
        } else {
          var siteUrl = smsHelper.makeUrl(phonenumber, messageString);
        }
        request(siteUrl, function(error, response, body) {  
        //request("http://apivm.valuemobo.com/SMS/SMS_ApiKey.asmx/SMS_APIKeyNUC?apiKey=25EJ1QKsnIKh3pT&cellNoList="+phonenumber+"&msgText="+messageString+"&senderId=yumCKC", function(error, response, body) {  
          console.log(result);
          return res.status(201).json({data: result, stringMs : siteUrl});
        });
      }
    })
  }).catch(function (err) {
    return res.status(500).json({error: err.message});
  });
}

//Kitchen ready to allocate
exports.KitchenSubmitted = function (req, res) {

  return Order.forge({id: req.params.id}).fetch().then(function(result){
    var order = result;
    var orderStatus = order.get('status');
    console.log("orderStatus");
    
    var ordermap;
    if(orderStatus == 100){
        var orderStatus = "Order Received";
        ordermap = 1;
    } else if(orderStatus == 202){ 
        var orderStatus = "Preparing";
        ordermap = 2;
    } else if(orderStatus == 204){ 
        var orderStatus = "Preparing";
        ordermap = 2;
    } else if(orderStatus == 301){ 
        var orderStatus = "On The Way";
        ordermap = 3;
    } else if(orderStatus == 308){ 
        var orderStatus = "On The Way";
        ordermap = 3;
    } else if(orderStatus == 303){ 
        var orderStatus = "Delivered";
        ordermap = 4;
    } else if(orderStatus == 400){ 
        var orderStatus = "Complete";
        ordermap = 5;
    }
    order.set("orderStatus", orderStatus);
    return order;
  }).then(function (order) {
    if ((order.get('status') != Order.status.KITCHEN_ACCEPTED && order.get('status') != Order.status.CREATED)) {
      throw new Error("State Error")
    }

    return order.save({
      status: Order.status.KITCHEN_COMPLETE
    }, {patch: true});

  }).then(function (result) {
    return res.status(201).json({data: result});
  }).catch(function (err) {
    return res.status(500).json({error: err.message});
  });
}

//Delivered  by driver
exports.delivered = function (req, res) {
  var order_id = req.params.id;
  var phonenumber = req.query.phonenumber;
  var orderVar;

  return Order.forge({id: order_id}).fetch().then(function (order) {
    orderVar = order;
    /*if (order.get('status') != Order.status.DELIVERY_ONROUTE &&
      order.get('status') != Order.status.DELIVERY_NEAR_DESTINATION &&
      order.get('status') != Order.status.DELIVERY_ATTENTION_REQUIRED) {
      throw new Error("State Error")
    }*/

    return order.save({
      status: Order.status.DELIVERY_COMPLETE
    }, {patch: true});
  }).then(function(){
    return new ordernote({
        order_id: order_id,
        action:  "DELIVERY_COMPLETE",
        comments: ""
      }).save(null);
  }).then(function (result) {
    var messageString = "Your order was delivered successfully.";
    if(orderVar.get("changeTo") == 1){
      var siteUrl = smsHelper.makeUrl(phonenumber, messageString, true);
    } else {
      var siteUrl = smsHelper.makeUrl(phonenumber, messageString);
    }
    request(siteUrl, function(error, response, body) {  
    //request("http://apivm.valuemobo.com/SMS/SMS_ApiKey.asmx/SMS_APIKeyNUC?apiKey=25EJ1QKsnIKh3pT&cellNoList="+phonenumber+"&msgText="+messageString+"&senderId=yumCKC", function(error, response, body) {  
      res.json({"ordernote": result, "ErrorCode":0, "ErrorMessage":"Order canceled successfully.", "Succeeded":true});
    });
    res.json({"ordernote": result, "ErrorCode":0, "ErrorMessage":"Order delivered successfully.", "Succeeded":true});
    /*res.status(201);
    return res.end();*/
  }).catch(function (err) {
    res.json({"ordernote": "", "ErrorCode":err.status, "ErrorMessage":err.message, "Succeeded":false});
    //return res.status(500).json({error: err.message});
  });
}

// Delivered by admin
exports.adminDelivered = function (req, res) {
  var order_id = req.params.id;
  var phonenumber = req.query.phonenumber;

  return Order.forge({id: order_id}).fetch().then(function (order) {
    req.body.cashbackAmount = order.get("cashbackAmount");
    req.body.kitchen_id = order.get("kitchen_id");
    req.body.admin_cashback = order.get("admin_cashback");
    return order.save({
      status: Order.status.COMPLETE
    }, {patch: true});
  }).then(function(){
    return new ordernote({
        order_id: order_id,
        action:  "COMPLETE",
        comments: ""
      }).save(null);
  }).then(function (result) {
    req.body.id = order_id;
    return UsersService.findByMobile(phonenumber).then(function(data){
      req.body.user_id = data.get("id");
      return exports.cashcodeorderssent(req, res).then(function(cData){
        console.log(cData);
        res.json(cData);
        //res.json({"ordernote": result, "ErrorCode":0, "ErrorMessage":"Order delivered successfully.", "Succeeded":true});
      });
    });
  }).catch(function (err) {
    res.json({"ordernote": "", "ErrorCode":err.status, "ErrorMessage":err.message, "Succeeded":false});
  });
}

//Driver Delivered
exports.printStatus = function (req, res) {
  var order_id = req.params.id;

  return Order.forge({id: order_id}).fetch().then(function (order) {

    /*if (order.get('status') != Order.status.DELIVERY_ONROUTE &&
      order.get('status') != Order.status.DELIVERY_NEAR_DESTINATION &&
      order.get('status') != Order.status.DELIVERY_ATTENTION_REQUIRED) {
      throw new Error("State Error")
    }*/

    return order.save({
      is_print: 1
    }, {patch: true});
  }).then(function (result) {
    res.json({"ordernote": result, "ErrorCode":0, "ErrorMessage":"Order statsu changed.", "Succeeded":true});
    /*res.status(201);
    return res.end();*/
  }).catch(function (err) {
    res.json({"ordernote": "", "ErrorCode":err.status, "ErrorMessage":err.message, "Succeeded":false});
    //return res.status(500).json({error: err.message});
  });
}

//Driver Canceled
exports.deliveryCanceled = function (req, res) {
  var cancelReason = req.body.cancelReason;
  var order_id = req.params.id;
  var phonenumber = req.body.phonenumber;
  return Order.forge({id: order_id}).fetch().then(function (order) {

    /*if (order.get('status') != Order.status.DELIVERY_ONROUTE &&
      order.get('status') != Order.status.DELIVERY_NEAR_DESTINATION &&
      order.get('status') != Order.status.DELIVERY_ATTENTION_REQUIRED) {
      throw new Error("State Error")
    }*/

    return order.save({
      status: Order.status.DELIVERY_REJECTED,
      comments: req.body.cancelReason,
      rejectBy: 2
    }, {patch: true});
  }).then(function(){
    return new ordernote({
        order_id: order_id,
        action:  "DELIVERY_REJECTED",
        comments: cancelReason
      }).save(null);
  }).then(function (result) {
    var messageString = "Sorry your delivery was canceled because of some reasons.";
    if(result.get("changeTo") == 1){
      var siteUrl = smsHelper.makeUrl(phonenumber, messageString, true);
    } else {
      var siteUrl = smsHelper.makeUrl(phonenumber, messageString);
    }
    request(siteUrl, function(error, response, body) {  
    //request("http://apivm.valuemobo.com/SMS/SMS_ApiKey.asmx/SMS_APIKeyNUC?apiKey=25EJ1QKsnIKh3pT&cellNoList="+phonenumber+"&msgText="+messageString+"&senderId=yumCKC", function(error, response, body) {  
      res.json({"ordernote": result, "ErrorCode":0, "ErrorMessage":"Order canceled successfully.", "Succeeded":true});
    });
    /*res.status(201);
    return res.end();*/
  }).catch(function (err) {
    res.json({"ordernote": "", "ErrorCode":err.status, "ErrorMessage":err.message, "Succeeded":false});
    //return res.status(500).json({error: err.message});
  });
}

//Final Delivery Canceled
exports.finalDeliveryCanceled = function (req, res) {
  var cancelReason = req.body.cancelReason;
  var order_id = req.params.id;
  var phonenumber = req.body.phonenumber;
  return Order.forge({id: order_id}).fetch().then(function (order) {

    /*if (order.get('status') != Order.status.DELIVERY_ONROUTE &&
      order.get('status') != Order.status.DELIVERY_NEAR_DESTINATION &&
      order.get('status') != Order.status.DELIVERY_ATTENTION_REQUIRED) {
      throw new Error("State Error")
    }*/

    return order.save({
      status: Order.status.FAILED,
      final_comments: req.body.cancelReason
    }, {patch: true});
  }).then(function(){
    return new ordernote({
        order_id: order_id,
        action:  "DELIVERY_REJECTED",
        comments: cancelReason
      }).save(null);
  }).then(function (result) {
    var messageString = "Sorry your delivery was canceled because of some reasons.";
    if(result.get("changeTo") == 1){
      var siteUrl = smsHelper.makeUrl(phonenumber, messageString, true);
    } else {
      var siteUrl = smsHelper.makeUrl(phonenumber, messageString);
    }
    request(siteUrl, function(error, response, body) {  
    //request("http://apivm.valuemobo.com/SMS/SMS_ApiKey.asmx/SMS_APIKeyNUC?apiKey=25EJ1QKsnIKh3pT&cellNoList="+phonenumber+"&msgText="+messageString+"&senderId=yumCKC", function(error, response, body) {  
      res.json({"ordernote": result, "ErrorCode":0, "ErrorMessage":"Order canceled successfully.", "Succeeded":true});
    });
    /*res.status(201);
    return res.end();*/
  }).catch(function (err) {
    res.json({"ordernote": "", "ErrorCode":err.status, "ErrorMessage":err.message, "Succeeded":false});
    //return res.status(500).json({error: err.message});
  });
}

//Kitchen Complete
exports.ready = function (req, res) {
  var orderID = req.params.id;
  var kountaRequest = createOauth2client(config.kounta.auth);
  var qry = Order.forge({id: orderID}).fetch();

  return qry.then(function (order) {
    var kountaID = order.get('kounta_id');

    if (order.get('status') != Order.status.PAYMENT_SUCCESSFUL)
      throw new Error("Unable to Complete Order")

    return kountaRequest({
      url: config.kounta.apiBase + 'orders/' + kountaID + '.json',
      method: 'PUT',
      json: {
        status: "COMPLETE"
      }
    });
  }).then(function (result) {
    return new Order({id: orderID}).save({
      status: Order.status.KITCHEN_COMPLETE
    }, {patch: true});
  }).then(function (result) {
    res.status(201);
    return res.end();
  }).catch(function (err) {
    return res.status(500).json({error: err.message});
  });
}

//TODO:
// - update CSR
// - change feasto order status
exports.cancel = function (req, res) {
  var kountaRequest = createOauth2client(config.kounta.auth);
  //TODO: check if the user has the privilege to cancel the order
  var orderID = req.params.id;
  //TODO: Can't cancel lunch order. Can't cancel if order status is already accepted.
  var canCancel = true;
  var alreadyCancelled = false;
  var kountaID;
  var refundAmount = 0;

  var qry = Order.forge({id: orderID}).fetch({
    withRelated: ['user']
  });

  return qry.then(function (order) {
    if (!order)
      throw new Error('Order Not Found');

    if (alreadyCancelled)
      throw new Error('Already Cancelled')

    if (!canCancel)
      throw new Error('Cannot Cancel Order');

    kountaID = order.get('kounta_id');
    return kountaRequest({
      url: config.kounta.apiBase + 'orders/' + kountaID + '.json',
      method: 'GET'
    });
  }).then(function (kountaOrder) {

    if (kountaOrder.payments.length == 0 || !kountaOrder.payments[0].ref)
      throw new Error('Payment Ref Not Found');

    // Assuming there is only one payment and it's paidto Stripe with a ref ID
    var refundAmount = 0 - kountaOrder.payments[0].amount;
    var chargeID = kountaOrder.payments[0].ref;
    console.log(refundAmount);

    /*return stripe.refunds.create({
      charge: chargeID
    });*/
    //.catch(function(err){
    //TODO: handle orders that has already been refunded
    //});
  }).then(function (refund) {
    console.log('Refund', refund);
    var amt = (0 - refund.amount) / 100;
    //Issue refund to clear balance in Kounta
    return kountaRequest({
      url: config.kounta.apiBase + 'orders/' + kountaID + '/payments.json',
      method: 'POST',
      json: {
        method_id: 21195,
        amount: amt,
        ref: refund.id
      }
    });
  }).then(function (kountaRefund) {
    console.log('kountaRefund', kountaRefund);

    //Update order status
    return kountaRequest({
      url: config.kounta.apiBase + 'orders/' + kountaID + '.json',
      method: 'PUT',
      json: {
        status: "REJECTED"
      }
    });
  }).then(function (result) {
    return new Order({id: orderID}).save({
      status: Order.status.CANCELED
    }, {patch: true});
  }).then(function (result) {
    res.status(201);
    return res.end();
  }).catch(function (err) {
    return res.status(500).json({error: err.message});
  });
};

exports.canFulfillLunch = function(req, res) {
  return res.json({ canfulfill: true });
  /*var order = req.body;

  var menuitems = _.map(order.menuItems, function(item) {
    return { product_id: item.menuItemId, quantity: item.quantity };
  });

  return deliveryManager.getSuitableVehicleList(menuitems).then(function(vehicle_ids) {
    if (vehicle_ids.length)
      return res.json({ canfulfill: true });
    return res.json({ canfulfill: false });
  });*/
};


exports.getDeliveryWindows = function(req, res){
  operationsService.getDeliveryWindows().then(function(deliveryWindows){
    return res.json(deliveryWindows);
  });
};


exports.largeOrderForm = function(req,res){
    var email = req.body.email,
        phone = req.body.phone,
        message = req.body.message,
        name = req.body.name;
    if (email && phone && message && name){
        var emailOptions = {
            subject: 'Large order request from eatfeast.com - '+name,
            from: email,
            replyTo: email,
            group: 'large order form',
            to: 'mstumpf@ellefsontech.com',
            html: message+' <br/><br/>Tel: '+phone
        };
        emailService.sendEmail(emailOptions)
            .then(function(data){
                res.status(feast.status.ok).json(JSON.stringify({
                    message: 'successfully submitted large order form'
                }));
            })
            .catch(function(error){
                res.status(feast.status.internal_server_error).json(JSON.stringify({
                    error: error
                }));
            });
    }
    else {
        res.status(feast.status.bad_request).json(JSON.stringify({
            error: true,
            code: feast.status.bad_request,
            data: {message: "Invalid parameters passed"}
        }));
    }
};

exports.getOrderDriver = function(req, res){
  var id = req.params.id;
   var fetchParams = {
      withRelated: [
        'driver_info'
      ]
    };
  orm.bookshelf.transaction(function(trx) {
    return Order.forge().query(function(qp){
      qp.where({id:id});
      qp.whereIn('status', [301, 308]);
    }).fetch(fetchParams).then(function(data){
      return data;
    });
  }).then(function(data){
      if(data){
        if(data.relations.driver_info!=null || data.relations.driver_info!=undefined){
          return data.relations.driver_info;
        }
      }
  }).then(function(data) {
    res.json({ "Driver": data, "ErrorCode":200, "ErrorMessage":"Driver Id.", "Succeeded":true});
  }).catch(function(err) {
    res.json({ "Driver": "", "ErrorCode":err.status, "ErrorMessage":err.message, "Succeeded":false});
  });
}

exports.getOrderStatus = function(req, res){
  var id = req.params.id;
  orm.bookshelf.transaction(function(trx) {
    return Order.forge().query(function(qp){
      qp.select('id', 'status');
      qp.where({id:id});
      //qp.whereIn('status', [301, 308]);
    }).fetch().then(function(data){
      return data;
    });
  }).then(function(data){
      if(data){
        var orderStatus = data.get('status');
        if(orderStatus == 100){
          data.set('status', 1);
        } else if(orderStatus == 202){ 
          data.set('status', 2);
        } else if(orderStatus == 204){ 
          data.set('status', 2);
        } else if(orderStatus == 301){ 
          data.set('status', 3);
        } else if(orderStatus == 308){ 
          data.set('status', 3);
        }
        return data;
      }
  }).then(function(data) {
    res.json({ "orderStatus": data, "ErrorCode":200, "ErrorMessage":"Order Status.", "Succeeded":true});
  }).catch(function(err) {
    res.json({ "orderStatus": "", "ErrorCode":err.status, "ErrorMessage":err.message, "Succeeded":false});
  });
}