var orm = require('../orm');

// Related Models initilize variables
var Address, Rating, Order, AuthUser, Kitchen;

var User = orm.bookshelf.Model.extend({
  tableName: 'users',
  idAttribute: 'id',
  addresses: function() { return this.belongsToMany(Address); },
  ratings: function() { return this.hasMany(Rating); },
  orders: function() { return this.hasMany(Order); },
  kitchen: function() { return this.hasMany(Kitchen); },
  authUser: function() { return this.belongsTo(AuthUser); }
});

module.exports = User;

// Load child models after exports, so that can create 2-way relations
Address = require('./address.model');
Rating = require('./rating.model');
Order = require('./order.model');
AuthUser = require('./authuser.model');
Kitchen = require('./kitchen.model');
