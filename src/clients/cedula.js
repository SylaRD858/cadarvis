const { HttpError } = require('../http/router');

// Cédula dominicana: 11 dígitos. No se valida el dígito verificador (hay cédulas viejas que no cumplen).
function normalizeCedula(input) {
  if (input === null || input === undefined) return null;
  const digits = String(input).replace(/\D/g, '');
  if (!digits && !String(input).trim()) return null;
  if (digits.length !== 11) throw new HttpError(400, 'Cédula inválida');
  return digits;
}

function formatCedula(c) {
  return c && c.length === 11 ? `${c.slice(0, 3)}-${c.slice(3, 10)}-${c.slice(10)}` : c;
}

module.exports = { normalizeCedula, formatCedula };
