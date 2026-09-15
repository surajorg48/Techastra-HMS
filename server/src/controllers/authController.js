const User = require('../models/User');
const jwt = require('jsonwebtoken');

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

exports.registerUser = async (req, res) => {
    const { name, email, password, role, phone } = req.body;

    try {
        const userExists = await User.findOne({ email });

        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const user = await User.create({
            name,
            email,
            password,
            role,
            phone
        });

        if (user) {
            res.status(201).json({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                token: generateToken(user._id),
            });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.loginUser = async (req, res) => {
    const { identifier, email, username, phone, password } = req.body || {};
    const id = (identifier || email || username || phone || '').toString().trim();

    if (!id || !password) {
        return res.status(400).json({ message: 'Please provide email or phone, and password' });
    }

    try {
        const isEmail = id.includes('@');
        const query = isEmail ? { email: id.toLowerCase() } : { phone: id };

        let user = await User.findOne(query);
        if (!user && isEmail) {
            user = await User.findOne({ email: { $regex: new RegExp(`^${id}$`, 'i') } });
        }

        if (user && (await user.matchPassword(password))) {
            if (!user.isActive) {
                return res.status(403).json({ message: 'Your account has been deactivated. Please contact administrator.' });
            }

            user.lastLogin = new Date();
            await user.save({ validateModifiedOnly: true });

            return res.json({
                _id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                token: generateToken(user._id),
            });
        } else {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

exports.getUserProfile = async (req, res) => {
    // Requires middleware to set req.user
    const user = await User.findById(req.user._id);

    if (user) {
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
        });
    } else {
        res.status(404).json({ message: 'User not found' });
    }
};
