// server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI chưa được thiết lập trong .env');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

const UserSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  age: { type: Number },
  address: { type: String, trim: true }
}, {
  collection: 'users',
  timestamps: true
});


const User = mongoose.model('User', UserSchema);

async function start() {
  try {
    await mongoose.connect(MONGODB_URI, {
      dbName: 'it4409',
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      // không thêm tlsAllowInvalidCertificates ở môi trường production
      // tls: true, // thường không cần nếu dùng +srv
    });

    // Đảm bảo index được tạo trước khi thao tác với dữ liệu
    await User.init();

    console.log('Connected to MongoDB Atlas');

    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
}


app.get('/api/users', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 5);
    const search = req.query.search ? String(req.query.search).trim() : '';

    const filter = search
      ? {
          $or: [
            { name: { $regex: search, $options: 'i' }},
            { email: { $regex: search, $options: 'i' }},
            { address: { $regex: search, $options: 'i' }},
          ],
        }
      : {};

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find(filter).skip(skip).limit(limit).exec(),
      User.countDocuments(filter).exec()
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({ users, total, page, totalPages, data: users });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { name, email, age, address } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email là bắt buộc' });
    }

    const exists = await User.findOne({ email: email.toLowerCase().trim() }).exec();
    if (exists) {
      return res.status(409).json({ message: 'Email đã tồn tại' });
    }

    const newUser = new User({ name, email, age, address });
    const saved = await newUser.save();

    res.status(201).json({ message: 'User created successfully', data: saved });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Email đã tồn tại (duplicate key)' });
    }
    res.status(400).json({ message: 'Server Error', error: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, age, address } = req.body;

    if (email) {
      const conflict = await User.findOne({ email: email.toLowerCase().trim(), _id: { $ne: id } }).exec();
      if (conflict) {
        return res.status(409).json({ message: 'Email đã được người khác sử dụng' });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { name, email, age, address },
      { new: true, runValidators: true }
    ).exec();

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'User updated successfully', data: updatedUser });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Email đã tồn tại (duplicate key)' });
    }
    res.status(400).json({ message: 'Server Error', error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedUser = await User.findByIdAndDelete(id).exec();
    if (!deletedUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'User deleted successfully', data: deletedUser });
  } catch (err) {
    res.status(400).json({ message: 'Server Error', error: err.message });
  }
});


start();
