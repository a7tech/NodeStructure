/**
 * Module dependencies
 */
var controller = require('../controllers/orders.controller');
var authMiddleware = require('../middleware/authusers.middleware');
var ordersMiddleware = require('../middleware/orders.middleware');
var notesController = require('../controllers/ordernotes.controller');
/**
 * the new Router exposed in express 4
 * the indexRouter handles all requests to the `/` path
 */
module.exports = function(router) {
  /**
   * this accepts all request methods to the `/` path
   */
  router.route('/orders/canfulfilllunch')
    .post(controller.canFulfillLunch);

  router.route('/orders')
    .post(controller.create)
    .get(controller.readAllOrders);
    //.get(authMiddleware.requiresInternalKeyOrLogin, controller.read);

  router.route('/cashcode-orders')
    .get(controller.cashcodeOrders);

  router.route('/cashcode-orders-sent/:id')
    .put(controller.cashcodeorderssent);

  router.route('/application/orders')
    .post(controller.createAppOrder);

  router.route('/orders/get/today')
    .get(controller.readTodayOrder);

  router.route('/orders/get/live')
    .get(controller.readLiveOrder);

  router.route('/orders/deliveryWindows')
    .get(controller.getDeliveryWindows);

  router.route('/orders/count')
    .get(authMiddleware.requiresLogin, controller.count);

  router.route('/orders/getNewOrderCount')
    .get(authMiddleware.requiresLogin, controller.getNewOrderCount);

  router.route('/orders/changeStatsToRead')
    .put(authMiddleware.requiresLogin, controller.changeStatsToRead);

  router.route('/orders/:id')
    .get(controller.find)
    .delete(authMiddleware.requiresInternalKeyOrLogin, controller.delete);

  router.route('/orders/:id/cancel')
    .post(authMiddleware.requiresLogin, controller.cancel);

  router.route('/users/:id/orders')
    .get(controller.findOrdersByUserID);

  router.route('/orders/:id/checkout')
  .post(controller.create);
    //.post(authMiddleware.requiresLogin, controller.checkout);

  router.route('/orders/:id/status')
    .get(authMiddleware.requiresLogin,
        controller.orderStatus);

  router.route('/orders/:id/callback')
    .post(authMiddleware.requiresInternalKey,
    controller.kitchenServiceOrderStatusChangedCallback);

  router.route('/orders/assigneDriver/List')
    .get(controller.assigneDriverList);

  //Privileged routes for internal communications
  router.route('/orders/:id/ready')
    .post(authMiddleware.requiresInternalKey, controller.ready);

  router.route('/orders/:id/pending')
    .post(controller.pending);

  router.route('/orders/:id/KitchenSubmitted')
    .post(controller.KitchenSubmitted);

  router.route('/orders/:id/acceptorder')
    .post(controller.processed);

  router.route('/orders/:id/rejectedorder')
    .post(controller.rejected);

  router.route('/orders/:id/onroute')
    .post(authMiddleware.requiresInternalKey, controller.onroute);

  router.route('/orders/:id/delivered')
    //.post(authMiddleware.requiresInternalKey, controller.delivered);
    .get(controller.delivered);

  router.route('/orders/:id/adminDelivered')
    .get(controller.adminDelivered);

  router.route('/orders/:id/deliveryCanceled')
    //.post(authMiddleware.requiresInternalKey, controller.delivered);
    .post(controller.deliveryCanceled);

  router.route('/orders/:id/finalDeliveryCanceled')
    //.post(authMiddleware.requiresInternalKey, controller.delivered);
    .post(controller.finalDeliveryCanceled);

  router.route('/orders/:id/notes')
    .get(authMiddleware.requiresInternalKey, notesController.read)
    .post(authMiddleware.requiresInternalKey, notesController.create);

  router.route('/orders/largeOrder')
      .post(controller.largeOrderForm);
        
  router.route('/orders/driver/:id')
      .get(controller.getOrderDriver);

  router.route('/orders/staus/:id')
      .get(controller.getOrderStatus);

  router.route('/orders/driverInactive')
      .put(controller.driverInactive);

  router.route('/orders/get/driver/order/:id')
      .get(controller.getDriverOrderList);

  router.route('/orders/driver/assigne')
      .put(controller.assigneDriver);

  router.route('/orders/print/receipt/:id')
      .put(controller.printStatus);

};
