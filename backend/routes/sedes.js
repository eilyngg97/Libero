const express = require('express');
const router = express.Router();
const sedeController = require('../controllers/sedeController');

router.get('/', sedeController.getSedes);
router.post('/', sedeController.createSede);
router.get('/:id', sedeController.getSedeById);
router.put('/:id', sedeController.updateSede);
router.delete('/:id', sedeController.deleteSede);

module.exports = router;
