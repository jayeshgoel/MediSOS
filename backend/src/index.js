// src/index.js
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const connectMongo = require('./config/db');
const authRoutes = require('./routes/auth.routes');

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

const PORT = process.env.PORT || 4000;

(async () => {
  try {
    await connectMongo(process.env.MONGO_URI);
    // routes
    app.use('/api/auth', authRoutes);

    app.get('/', (req, res) => res.json({ ok: true }));
    app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
