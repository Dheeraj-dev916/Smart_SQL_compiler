export const SQL_KEYWORDS = new Set([
  'SELECT', 'DISTINCT', 'FROM', 'WHERE', 'AS', 'AND', 'OR', 'NOT', 'IN', 'IS', 'LIKE', 'BETWEEN',
  'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS', 'ON', 'USING', 'GROUP', 'BY', 'HAVING',
  'ORDER', 'ASC', 'DESC', 'LIMIT', 'OFFSET', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
  'CREATE', 'TABLE', 'DROP', 'ALTER', 'UNION', 'ALL', 'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'WITH', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'CAST', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES',
]);

export const AGGREGATE_FUNCTIONS = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']);
