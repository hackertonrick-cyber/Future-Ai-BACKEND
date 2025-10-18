import multer from 'multer';
// import path from "path";

// // Set up storage for the uploaded files
// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, 'uploads/'); // Directory where files will be stored
//   },
//   filename: function (req, file, cb) {
//     cb(null, Date.now() + path.extname(file.originalname)); // Unique filenames
//   }
// });

// File type filter (accepting only images and videos)
// const fileFilter = (req, file, cb) => {
//   const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/webm'];
//   if (validTypes.includes(file.mimetype)) {
//     cb(null, true); // Accept file
//   } else {
//     cb(new Error('Invalid file type. Only images and videos are allowed.'), false);
//   }
// };

// // Initialize multer with storage and file filter
// const maxSize = 1 * 1024 * 1024 * 1024;

// const processFile = multer({
//   storage: multer.memoryStorage(),
//   fileFilter: fileFilter,
//   limits: { fileSize: maxSize },
// });

const profileFileFilter = (req, file, cb) => {
  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (validTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPG, PNG, and WEBP allowed for profile images.'), false);
  }
};

const profileImageUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: profileFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

const mediaFileFilter = (req, file, cb) => {
  const validTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'audio/mpeg',
    'audio/wav',
    'audio/webm',
  ];
  if (validTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images, videos, and audio are allowed.'), false);
  }
};

const mediaUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: mediaFileFilter,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max (adjust depending on your budget + use case)
});
export {profileImageUpload, mediaUpload };