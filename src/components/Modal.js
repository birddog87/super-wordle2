import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const Modal = ({ show, onClose, children }) => {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="bg-white p-8 rounded-lg max-w-md w-full"
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
          >
            {children}
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded"
            >
              Close
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Modal;