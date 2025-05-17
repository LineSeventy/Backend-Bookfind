require('dotenv').config();
const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const axios = require("axios");

const app = express();
console.log('Database URL:', process.env.DATABASE_URL);


app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());


const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false,
  } : false,
});


app.get('/api/matched-books', async (req, res) => {
  try {
    const bookId = req.query.id;

    if (bookId) {
      const result = await pool.query('SELECT * FROM matched_books WHERE id = $1', [bookId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Book not found' });
      }
      return res.json(result.rows);
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const offset = (page - 1) * limit;

    const totalRes = await pool.query('SELECT COUNT(*) FROM matched_books');
    const totalBooks = parseInt(totalRes.rows[0].count);

    const { rows } = await pool.query(
      'SELECT * FROM matched_books OFFSET $1 LIMIT $2',
      [offset, limit]
    );

    res.json({
      books: rows,
      total: totalBooks,
      page,
      totalPages: Math.ceil(totalBooks / limit),
    });
  } catch (error) {
    console.error('Error fetching matched_books:', error); 
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/search-books', async (req, res) => {
  try {
    const query = req.query.q;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter q is required' });
    }

    const { rows } = await pool.query(
      `SELECT id, fullybooked_title FROM matched_books
       WHERE fullybooked_title ILIKE $1
       LIMIT 10`,
      [`%${query}%`]
    );

    res.json(rows);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/create-payment', async (req, res) => {
  const { amount } = req.body;
  const PAYMONGO_SECRET = process.env.PAYMONGO_SECRET;

  try {
    const response = await axios.post(
      'https://api.paymongo.com/v1/payment_intents',
      {
        data: {
          attributes: {
            amount: amount * 100,
            payment_method_allowed: ['card', 'gcash'],
            payment_method_types: ['card'],
            currency: 'PHP',
          },
        },
      },
      {
        headers: {
          Authorization: 'Basic ' + Buffer.from(PAYMONGO_SECRET + ':').toString('base64'),
          'Content-Type': 'application/json',
        },
      }
    );

    res.json(response.data);
  } catch (err) {
    console.error('PayMongo Error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Payment intent creation failed' });
  }
});


const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});