const { DataTypes } = require('sequelize');
const { getSequelize } = require('../db/postgres');

const ShopUser = getSequelize().define('ShopUser', {
  email: {
    type: DataTypes.STRING(120),
    allowNull: false,
    unique: true,
    validate: { isEmail: true },
  },
  first_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  last_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  password_hash: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  role: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'user',
    validate: { isIn: [['user', 'seller', 'admin']] },
  },
  blocked: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  created_at: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: () => Date.now(),
  },
  updated_at: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: () => Date.now(),
  },
}, {
  tableName: 'shop_users',
  timestamps: false,
  indexes: [{ unique: true, fields: ['email'] }],
});

function formatShopUser(user) {
  const json = user.toJSON ? user.toJSON() : user;
  return {
    id: String(json.id),
    email: json.email,
    first_name: json.first_name,
    last_name: json.last_name,
    role: json.role,
    blocked: json.blocked,
    created_at: Number(json.created_at),
    updated_at: Number(json.updated_at),
  };
}

module.exports = { ShopUser, formatShopUser };
