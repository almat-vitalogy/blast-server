const mongoose = require('mongoose');

const BlastMessageSchema = new mongoose.Schema({
  title: String,              
  sent: Number,               
  delivered: Number,          
  failed: Number,             
  date: String,               
  status: {                   
    type: String,
    default: "Scheduled"
  },
  activity: {                 
    icon: String,             
    description: String,      
    timestamp: String         
  }
});

module.exports = mongoose.model('BlastMessage', BlastMessageSchema);
