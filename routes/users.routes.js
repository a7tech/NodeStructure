/**
 * Module dependencies
 */
var controller = require('../controllers/users.controller');
var authController = require('../controllers/authusers.controller');
var authMiddleware = require('../middleware/authusers.middleware');

/**
 * the new Router exposed in express 4
 * the indexRouter handles all requests to the `/` path
 */
module.exports = function(router) {
  /**
   * this accepts all request methods to the `/` path
   */

  router.route('/users/me')
      .get(authMiddleware.requiresLogin, controller.findMe)
      .put(authMiddleware.requiresLogin, controller.updateMe);

  router.route('/users/count')
      .get(authMiddleware.requiresLogin, controller.count)

  router.route('/mobile/find')
      .get(controller.findByMobile);

  router.route('/users/admin/:user_type') 
      .get(controller.list);

  router.route('/users/order/:user_type') 
      .get(controller.orderlist);

  router.route('/users/me/password')
      .post(authController.resetPassword)
      .put(authMiddleware.requiresLogin, authController.changePasswordWithOldPassword);

  router.route('/users/me/changePassword')
      .post(controller.changePasswordWithSecureToken);

  router.route('/users/me/email')
      .put(authMiddleware.requiresLogin, controller.changeEmail);

// TODO: only add this again when an admin needs to update users
// TODO: Need to add middleware to make sure credentials are correct (changng update)
  router.route('/users/:id')
      .get(controller.find)
      .delete(controller.delete)
      .put(controller.updateUser);
//    .put(authMiddleware.requiresLogin, controller.update);

  router.route('/users')
      .get(controller.list)
      .post(controller.create);

  router.route('/dining_customer')
      .post(controller.createSiningUser);
      
  router.route('/driverSignUp')
      .post(controller.driverSignUp);

  router.route('/driverVerifyOTP')
      .post(controller.driverVerifyOTP);

  router.route('/usersignup')
      .post(controller.usersignup);

  router.route('/userShareSignup')
      .post(controller.userShareSignup);

  router.route('/users/create')
      .post(controller.createUser);

  router.route('/users/driver/position')
      .put(controller.updatePosition);

  router.route('/users/driver/position/:id/:did')
      .get(controller.getPosition);

  router.route('/userssentOTP')
      .post(controller.usersignupOTP);

  router.route('/usersVerifyOTP')
      .post(controller.usersVerifyOTP);

}
