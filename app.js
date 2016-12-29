  /**
 * Module dependencies.
 */

var config = require('./config');

if (config.newrelic.enabled) {
  var newrelic = require('newrelic');
}

var express        = require('express'),
    expressHbs     = require('express-handlebars'),
    path           = require('path'),
    mongoose       = require('mongoose'),
    logger         = require('morgan'),
    bodyParser     = require('body-parser'),
    compress       = require('compression'),
    favicon        = require('static-favicon'),
    methodOverride = require('method-override'),
    errorHandler   = require('errorhandler'),
    cookieParser   = require('cookie-parser'),
    session        = require('express-session'),
    routes         = require('./routes'),
    multiLogger    = require('./services/logger.service'),
    Promise = require("bluebird"),
    googleService  = require('./services/3rdparty/google.service'),
    cacheService   = require('./services/cache.service'),
    contentfulService = require('./services/3rdparty/contentful.service'),
    kitchenService = require('./services/3rdparty/kitchen.service'),
    deliveryService =require('./services/3rdparty/delivery.service'),
    paymentService = require('./services/3rdparty/payments.service'),
    smsService     = require('./services/3rdparty/sms.service'),
    usersService     = require('./services/users.service'),
    emailService   = require('./services/3rdparty/email.service'),
    moment = require('moment'),
    request = require("request");

var InstanceMessage = require('./models/instanceMessage.model');

// Setup Passport
var passportAuth = require('./authenticate');

var app = express(),
    server = require('http').createServer(app),
    io = require('socket.io').listen(server);

// allow CORS
app.all('*', function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-type,Accept,X-Access-Token,X-Key');

    if (req.method == 'OPTIONS') {
        res.status(200).end();
    } else {
        next();
    }
});

app.engine('hbs', expressHbs({extname:'hbs', defaultLayout:'layout.hbs'}));

app.use(bodyParser.urlencoded({'extended':'true', 'limit': '50mb'}));
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.json({ type: 'application/vnd.api+json' }));

/**
 * Express configuration.
 */
app.set('port', config.server.internalPort);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

app
  .use(compress())
  .use(favicon())
  .use(logger('short'))
  .use(bodyParser())
  .use(methodOverride())
  .use(express.static(path.join(__dirname, 'public')))
  .use(cookieParser())
  .use(session({secret: config.session.secret
    , resave:false
    , saveUninitialized:false}))
  .use(passportAuth.initialize())
  .use(passportAuth.session())
  .use(routes.router)
  .use(function (req, res) {
    res.status(404).render('404', {title: 'Not Found :('});
  });

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});


// error handlers
app.use(function (err, req, res, next) {
    var code = err.status || 500;
    return res.status(code).json({
        error: true,
        code: code,
        data: {message: err.message}
    });
});



//Prototypes and things
if (typeof String.prototype.startsWith != 'function') {
  // see below for better implementation!
  String.prototype.startsWith = function (str){
    return this.indexOf(str) === 0;
  };
}

//Setup services


var servicesPromises = [
    cacheService.init(),
    googleService.init(config.google),
    contentfulService.init(config.contentful),
    kitchenService.init(config.kounta),
    paymentService.init(config.stripe),
    deliveryService.init(config.maxoptra),
    smsService.init(config.sms),
    emailService.init(config.campaign_monitor)
];

Promise.all(servicesPromises).then(function() {
  multiLogger.info('app.js','All services initialized');
  server.listen(app.get('port'), function () {
    multiLogger.info('app.js','Express server listening on port ' + app.get('port'));
  });
})
.catch(function(error){
  multiLogger.error('app.js', 'failed to start Feast API:' + JSON.stringify(error));
});

var usernames = {};
var userIDArray = [];
var userNameArray = {};
var room = [];
var timeInterval = null;
/**
* Check user key status from user sockat array
*/ 
function check_key(v) {
    var val = '';
    for (var key in usernames) {
        if (usernames[key] == v)
            val = key;
    }
    return val;
}

/**
*  Socaket connection initialize
*/ 
io.on('connection', function(socket) {

  // User join the socket from web/mobile application
  socket.on('join', function(userfromdata) {
    console.log("userfromdata");
    console.log(userfromdata);

    // Checking the request came from admin / mobile application user
    if(userfromdata=="AppJoin"){
      io.emit('addappuserinit', {
        error: false,
        message: 1
      });
    } else {
      io.emit('adduserinit', {
        error: false,
        message: 1
      });
    }
  });

  // For reject order from kitchen.
  socket.on('setKitchenReject', function(ipData){
      var phonenumber = ipData.phonenumber;
      return Order.forge({id: ipData.id}).fetch().then(function (order) {
        
        if (order.get('status') != Order.status.KITCHEN_ACCEPTED && order.get('status') != Order.status.KITCHEN_PENDING && order.get('status') != Order.status.CREATED) {
          throw new Error("State Error")
        }

        return order.save({
            status: Order.status.KITCHEN_REJECTED,
            comments: ipData.comments,
            driver_id : 0
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
        request("http://apivm.valuemobo.com/SMS/SMS_ApiKey.asmx/SMS_APIKeyNUC?apiKey=25EJ1QKsnIKh3pT&cellNoList="+phonenumber+"&msgText=Sorry! We are not able to serve your order right now.&senderId=yumCKC", function(error, response, body) {  
          return res.status(201).json({data: result});
        });
      }).catch(function (err) {
        return res.status(500).json({error: err.message});
      });
  });

  // For accpect order from kitchen.
  socket.on('setKitchenAccpect', function(ipData){
      var timeTaken = ipData.timeTaken;
      var phonenumber = ipData.phonenumber;
      var gettedOrder;
      return Order.forge({id: ipData.id}).fetch().then(function (order) {
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
            var messageString = "Dear "+data.get("firstname")+", Your Order "+ipData.id+" with CKC is in process. COD Amount Rs. "+gettedOrder.get("totalAmount")+". Expt. delivery Time :"+finalTime+" minutes.";
            request("http://apivm.valuemobo.com/SMS/SMS_ApiKey.asmx/SMS_APIKeyNUC?apiKey=25EJ1QKsnIKh3pT&cellNoList="+phonenumber+"&msgText="+messageString+"&senderId=yumCKC", function(error, response, body) {  
              io.sockets.in(ipData.id).emit('getLiveOrders1', {data: result});
            });
          }
        })
      }).catch(function (err) {
        io.sockets.in(ipData.id).emit('getLiveOrders1', {error: err.message});
      });
  })

  // For getting live orders.
  socket.on('getLiveOrders', function(ipData){
    var isCurrent = (ipData.current == "true" ? true : false);
    var uid = null, usertype = null;
    var platform = (ipData.platform)?ipData.platform:false;
    var kitchen_id = (ipData.kitchen_id)?ipData.kitchen_id:false;
    var finalOrderArray = {
      "orders" : [],
      "phoneNumbersArray" : []
    };

    var usertype= ipData.user_type;
    uid = ipData.userIdfrom;


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
            qb.andWhere('kitchens.OwnedBy', '=', ipData.subadmin_id);
            qb.andWhere('date', 'like',  '%'+moment().format("YYYY-MM-DD")+'%');
            //qb.andWhere('date', '>', moment().startOf('day').format());
          } else if(undefined != uid && usertype == 'kitchen_manager'){
            qb.join('kitchens', 'kitchens.id', '=', 'orders.kitchen_id');
            qb.where('kitchens.user_id', '=', uid);
            qb.andWhere('date', 'like',  '%'+moment().format("YYYY-MM-DD")+'%');
            //qb.andWhereNot({'status':303});
            qb.andWhereNot({'status':203});
            qb.andWhereNot({'status':400});
            qb.andWhereNot({'status':304});
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
           io.sockets.in(uid).emit('sendLiveOrder', orders);
        } else {
           io.sockets.in(uid).emit('sendLiveOrder', finalOrderArray.orders);
        }
      }).catch(function(err) {
        io.sockets.in(uid).emit('sendLiveOrder', uid);
      });
  });

  // Add admin to socket and get the customer list on it
  socket.on('adduser', function(userfromdata) {
    console.log("add");

    if (userIDArray.indexOf(userfromdata.userIdfrom) == -1) {
      userIDArray.push(userfromdata.userIdfrom);
    }
    if (room.indexOf(userfromdata.userIdfrom) == -1) {
      socket.room = userfromdata.userIdfrom;
      room.push(userfromdata.userIdfrom);
    }
    if (io.sockets.adapter.sids[socket.id][userfromdata.userIdfrom] == undefined) {
      socket.join(userfromdata.userIdfrom);
    }

    userNameArray[userfromdata.userIdfrom] = userfromdata.usernamefrom;
    socket.nickname = userfromdata.usernamefrom;
    socket.UserID = userfromdata.userIdfrom;
    socket.platformId = userfromdata.plateFormId;
    socket.ConnectionId = socket.id;
    usernames[userfromdata.userIdfrom] = socket;

    var results = {
      error: false,
      message: "",
      userfromname: userfromdata.usernamefrom,
      userfromid: userfromdata.userIdfrom,
      friendusers: [],
      onScreenIndex: ""
    }
    
    usersService.find(userfromdata.userIdfrom).then(function(users) {
      if (!users) {
        return results;
      }
      
      return usersService.getMessagesCount(userfromdata.subadmin_id, userfromdata.userIdfrom).then(function(finalResult) {
        
        if (finalResult.length){
          results.friendusers.push(finalResult);
        }
        return results;
      }).then(function(results) {
        //socket.emit('checkOnSocketScreenClient', "checkOnSocketScreenClient");
        console.log("finalResult");
        console.log(userfromdata.userIdfrom);
        //usernames[userfromdata.userIdfrom].emit('updateusers', results);
        if(userfromdata.is_live == false){
          io.sockets.in(userfromdata.userIdfrom).emit('updateusers', results);
        } else {
          io.sockets.in(userfromdata.userIdfrom).emit('getLiveOrders1', results);
        }
      });
    });

  });

  // Add customer(mobile application user) to socket
  socket.on('addAppUser', function(userfromdata) {
    console.log("add");
    userNameArray[userfromdata.userIdfrom] = userfromdata.usernamefrom;
    socket.nickname = userfromdata.usernamefrom;
    socket.UserID = userfromdata.userIdfrom;
    socket.platformId = userfromdata.plateFormId;
    socket.ConnectionId = socket.id;
    usernames[userfromdata.userIdfrom] = socket;

    var results = {
      error: false,
      message: "",
      userfromname: userfromdata.usernamefrom,
      userfromid: userfromdata.userIdfrom,
      friendusers: [],
      onScreenIndex: ""
    }
    
    usersService.find(userfromdata.userIdfrom).then(function(users) {
      if (!users) {
        return results;
      }

      console.log("userfromdata.userIdfrom");
      console.log(userfromdata.userIdfrom);

      io.sockets.in(userfromdata.userIdfrom).emit('updateAppUsers', results);      
    });
  });

  // check user from and to and send user chat data to admin
  socket.on('check_user', function(data) {
    var fetchParameters = {
        withRelated: [
            'UserFrom',
            'UserTo'
        ]
    };
    var tipUpdateParams = {
        patch: true
    };
    var tipFetchParams = {};

    var params = {
        is_read: 1,
        is_not_read: 1
    }
    InstanceMessage.forge().query(function(qb) {
        qb.where(function() {
            this.where('MessageTo', data.rUserID)
                .andWhere('MessageBy', data.userIdfrom)
        }).orWhere(function() {
            this.where('MessageTo', data.userIdfrom)
                .andWhere('MessageBy', data.rUserID)
        });
        qb.orderBy('Id', 'desc').limit(10);
    }).fetchAll(fetchParameters).then(function(addy) {

        var chat = {
            username: data.rUsername,
            rUserID: data.rUserID,
            messages: addy,
            userIdfrom: data.userIdfrom
        }
        io.sockets.in(data.userIdfrom).emit('msg_user_found', chat);
    });
  });

  // Passing the messages from user to user
  socket.on('msg_user', function(data) {
    var userfromname = data.userfromname;
    var msg = data.msg;
    var res_userId = data.res_userId;
    var sen_userId = data.sen_userId;
    var type = (data.type) ? (data.type) : 'text';
    var instanceMessage = new InstanceMessage({
      MessageTo: res_userId,
      MessageBy: sen_userId,
      Message: msg,
      is_read: 0,
      is_not_read: 1,
      type: type
    });
    instanceMessage.save(null).tap(function(model) {
      var returnString = model.get('Id');
      var instanceMessage = InstanceMessage.forge().query(function(qb) {
        qb.where(function() {
          this.where('MessageTo', res_userId)
            .andWhere('MessageBy', sen_userId)
            .andWhere('is_read', 0)
            .andWhere('is_not_read', 1)
        });
      }).fetchAll().then(function(addy) {
        if(addy.models[addy.models.length-1].get("Id")!=undefined){
          var msgmsg = addy.models[addy.models.length-1].get("Id");
        } else {
          var msgmsg = "";
        }

        var data = {
          userfromname: userfromname,
          data: msg,
          sen_userId: String(sen_userId),
          res_userId: String(res_userId),
          type: type,
          MessageId: msgmsg
        }
        console.log("usernames[sen_userId]");
        console.log(sen_userId);
        console.log(res_userId);
        io.sockets.in(sen_userId).emit('msg_user_handle', data);
        io.sockets.in(res_userId).emit('msg_user_handle', data);
      });
    });
  });

  // change status of message when user read the message
  socket.on('chagestatusofmessages', function(data) {
    var sendfrom = data.sendfrom;
    var sendto = data.sendto;
    InstanceMessage.forge().query(function(qb) {
      qb.where(function() {
        this.where('MessageTo', sendto).andWhere('MessageBy', sendfrom)
      }).update({
        is_read: 1,
        is_not_read: 0
      });
    }).fetchAll(function(data) {

    });
  });

});


var headers = {
    'Authorization': 'key=AIzaSyB0Uuty0Zjcb6iMNG_iP336m_Jru4E-Pwc',
    'Content-Type': 'application/json'
};

var dataString = '{"to":"ffWy1FhtX8M:APA91bE-NJTBfoPdI-SlTYe7G6LR6WEs8PBqGFlO8SRs-yd88rXxCAn3Cx_jmp4vBDGKp5hQ7zRFCRAcrg2q45GEaaVSy0LIJqkwRullkt1ZxD_VGcYJBxyIQg6DGNzdhyHlVuud0LaI","notification":{"name":"Yellow", "title":"this is title"}}';

var options = {
    url: 'https://fcm.googleapis.com/fcm/send',
    method: 'POST',
    headers: headers,
    body: dataString
};

function callback(error, response, body) {
    if (!error && response.statusCode == 200) {
        console.log(body);
    }
}

request(options, callback);
