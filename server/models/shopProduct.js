const mongoose = require('mongoose');

const shopProductSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0, default: 0 },
  stock: { type: Number, min: 0, default: 0 },
  rating: { type: Number, min: 0, max: 5, default: 0 },
  image: {
    type: String,
    default: 'https://via.placeholder.com/300x200?text=Product',
  },
  created_at: { type: Number, default: () => Date.now() },
  updated_at: { type: Number, default: () => Date.now() },
});

shopProductSchema.index({ category: 1 });
shopProductSchema.index({ created_at: -1 });

const ShopProduct = mongoose.model('ShopProduct', shopProductSchema, 'shop_products');

function formatShopProduct(doc) {
  const json = doc.toObject ? doc.toObject() : doc;
  return {
    id: json._id.toString(),
    title: json.title,
    category: json.category,
    description: json.description,
    price: Number(json.price),
    stock: Number(json.stock),
    rating: Number(json.rating),
    image: json.image,
    created_at: Number(json.created_at),
    updated_at: Number(json.updated_at),
  };
}

const DEFAULT_PRODUCTS = [
  { title: 'Кастрюля из нержавеющей стали 5л', category: 'Кастрюли', description: 'Универсальная кастрюля из нержавеющей стали с толстым дном для равномерного нагрева. Подходит для всех типов плит, включая индукционные.', price: 3490, stock: 30, rating: 4.7, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTuUcUNbzUpanMPqe5xS80xjf52mlnACgU6Iw&s' },
  { title: 'Чугунная кастрюля с крышкой 3л', category: 'Кастрюли', description: 'Классическая чугунная кастрюля с эмалированным покрытием. Идеальна для тушения, томления и запекания в духовке.', price: 5990, stock: 15, rating: 4.9, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS8gWBRCeI4K7tpTHCfvNq8wzBlE1yVgVgqjg&s' },
  { title: 'Сотейник с антипригарным покрытием 2л', category: 'Сотейники', description: 'Алюминиевый сотейник с многослойным антипригарным покрытием и удобной бакелитовой ручкой. Легкий и практичный.', price: 2190, stock: 45, rating: 4.4, image: 'https://static.insales-cdn.com/images/products/1/175/269246639/1100232_001.jpg' },
  { title: 'Кастрюля-скороварка 6л', category: 'Скороварки', description: 'Скороварка из нержавеющей стали с системой безопасного замка крышки. Готовит блюда в 3 раза быстрее обычной кастрюли.', price: 7890, stock: 12, rating: 4.6, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTVGLn9YIzAk33CWgRnAbSlvbYo4QgNFBXFBA&s' },
  { title: 'Набор кастрюль «Домашний повар» (3 шт)', category: 'Наборы', description: 'Набор из трёх кастрюль (1.5л, 3л, 5л) из нержавеющей стали с мерной шкалой внутри и стеклянными крышками.', price: 6490, stock: 20, rating: 4.8, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRewjK0777moKHXg2Q2EUhiNHqSM8UmRdmWbw&s' },
  { title: 'Молочник с двойным дном 1.5л', category: 'Ковши', description: 'Ковш-молочник из нержавеющей стали с капсульным дном. Удобный носик для аккуратного слива. Подходит для индукции.', price: 1790, stock: 55, rating: 4.3, image: 'https://cdn.vseinstrumenti.ru/images/goods/tovary-dlya-ofisa-i-doma/tovary-dlya-doma/5128867/2400x1600/65270491.jpg' },
];

async function seedDefaultProducts() {
  const count = await ShopProduct.countDocuments();
  if (count > 0) return 0;
  const now = Date.now();
  const rows = DEFAULT_PRODUCTS.map((p) => ({ ...p, created_at: now, updated_at: now }));
  await ShopProduct.insertMany(rows);
  return rows.length;
}

module.exports = { ShopProduct, formatShopProduct, seedDefaultProducts };
