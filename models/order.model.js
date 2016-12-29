var orm = require('../orm');

// Related Models
var Address, DeliveryWindow, MenuItem, MenuItemOrder, Payment, User, Kitchen, OrderStatusChange, kitchenArea;

var Order = orm.bookshelf.Model.extend({
  tableName: 'orders',
  idAttribute: 'id',
  Address: function() { return this.belongsTo(Address,'delivery_address_id'); },
  deliveryAddress: function() { return this.belongsTo(Address,'delivery_address_id'); },
  deliveryWindow: function() { return this.belongsTo(DeliveryWindow); },
  menuItems: function() { return this.belongsToMany(MenuItem); },
  menuitems: function() { return this.belongsToMany(MenuItem); },
  menuitemsCombos: function() { return this.hasMany(MenuItemOrder).query(function(qp){
    qp.where('is_combo', 1);
    //qp.groupBy('combo_id');
  }); },
  oredritems: function() { return this.belongsToMany(MenuItem); },
  menuItemOrders: function() { return this.hasMany(MenuItemOrder); },
  payment: function() { return this.belongsTo(Payment); },
  user: function() { return this.belongsTo(User, 'user_id'); },
  driver_info: function() { return this.belongsTo(User, 'driver_id'); },
  kitchen: function() { return this.belongsTo(Kitchen, 'kitchen_id'); },
  kitchenArea: function() { return this.belongsTo(kitchenArea, 'kitchen_areas_id'); },
  orderStatusChanges: function() { return this.hasMany(OrderStatusChange); },
  filters: {
    insert: [
      'user_id',
      'delivery_address_id',
      'deliverywindow_id',
      'status',
      'kounta_id',
      'date',
      'fulfil_date',
      'mealtype',
      'sla',
      'eta',
      'kitchen_id',
      'promo_code',
      'isValid',
      'statusCode',
      'discountAmount',
      'creditApplied',
      'totalAmount',
      'kitchen_areas_id',
      'specialRequest',
      'warnInfo',
      'cashInfo',
      'is_cashback',
      'cashbackAmount',
      'ttm',
      'comments',
      'defaultCurrencySymbol',
      'totalRoundOffAmount',
      'finalTaxAmount',
      'direction',
      'order_type',
      'admin_cashback',
      'credit_type',
      'is_tasito_wallet_used',
      'rejectBy',
      'final_comments',
      'changeTo'
    ]
  }
});

Order.status = {
  CREATED: 100,
  PAYMENT_SUCCESSFUL: 101,
  PAYMENT_FAILED: 900,
  CANCELED: 103,
  KITCHEN_PENDING: 200,
  KITCHEN_SUBMITTED: 201,
  KITCHEN_ACCEPTED: 202,
  KITCHEN_REJECTED: 203,
  KITCHEN_COMPLETE: 204,
  KITCHEN_ATTENTION_REQUIRED: 901,
  DELIVERY_WAITING_FOR_PICKUP: 300,
  DELIVERY_ONROUTE: 301,
  DELIVERY_NEAR_DESTINATION: 302,
  DELIVERY_COMPLETE: 303,
  DELIVERY_REJECTED: 304,
  DELIVERY_ARRIVED: 305,
  DELIVERY_LATE: 306,
  DELIVERY_READY_TO_ALLOCATE: 307,
  DELIVERY_ALLOCATING: 308,
  DELIVERY_ATTENTION_REQUIRED: 902,
  COMPLETE: 400,
  FAILED: 903
};

module.exports = Order;
module.exports.getOrderDescription = function(status_id) {
  switch(status_id) {
    case Order.status.CREATED:
      return 'CREATED';
      break;
    case Order.status.PAYMENT_SUCCESSFUL:
      return 'PAYMENT_SUCCESSFUL';
      break;
    case Order.status.PAYMENT_FAILED:
      return 'PAYMENT_FAILED';
      break;
    case Order.status.CANCELED:
      return 'CANCELED';
      break;
    case Order.status.KITCHEN_PENDING:
      return 'KITCHEN_PENDING';
      break;
    case Order.status.KITCHEN_SUBMITTED:
      return 'KITCHEN_SUBMITTED';
      break;
    case Order.status.KITCHEN_ACCEPTED:
      return 'KITCHEN_ACCEPTED';
      break;
    case Order.status.KITCHEN_REJECTED:
      return 'KITCHEN_REJECTED';
      break;
    case Order.status.KITCHEN_COMPLETE:
      return 'KITCHEN_COMPLETE';
      break;
    case Order.status.KITCHEN_ATTENTION_REQUIRED:
      return 'KITCHEN_ATTENTION_REQUIRED';
      break;
    case Order.status.DELIVERY_WAITING_FOR_PICKUP:
      return 'DELIVERY_WAITING_FOR_PICKUP';
      break;
    case Order.status.DELIVERY_ONROUTE:
      return 'DELIVERY_ONROUTE';
      break;
    case Order.status.DELIVERY_NEAR_DESTINATION:
      return 'DELIVERY_NEAR_DESTINATION';
      break;
    case Order.status.DELIVERY_COMPLETE:
      return 'DELIVERY_COMPLETE';
      break;
    case Order.status.DELIVERY_REJECTED:
      return 'DELIVERY_REJECTED';
      break;

    case Order.status.DELIVERY_ARRIVED:
      return 'DELIVERY_ARRIVED';
      break;
    case Order.status.DELIVERY_LATE:
      return 'DELIVERY_LATE';
      break;
    case Order.status.DELIVERY_ATTENTION_REQUIRED:
      return 'DELIVERY_ATTENTION_REQUIRED';
      break;
    case Order.status.DELIVERY_READY_TO_ALLOCATE:
      return 'DELIVERY_READY_TO_ALLOCATE';
      break;
    case Order.status.DELIVERY_ALLOCATING:
      return 'DELIVERY_ALLOCATING';
      break;
    case Order.status.COMPLETE:
      return 'COMPLETE';
      break;
    case Order.status.FAILED:
      return 'FAILED';
      break;
    default:
      return 'UNKNOWN';
  }
}

// Load child models after exports, so that can create 2-way relations
Address = require('./address.model');
DeliveryWindow = require('./deliverywindow.model');
MenuItem = require('./menuitem.model');
MenuItemOrder = require('./menuitemorder.model');
Payment = require('./payment.model');
User = require('./user.model');
Kitchen = require('./kitchen.model');
OrderStatusChange = require('./orderstatuschange.model')
kitchenArea = require('./kitchen_area.model')