const { renderTemplate, findTemplateTokens } = require("./templateRenderer");

const template = `
This Work Order is issued by <strong>{{buyer_company_name}}</strong>
to <strong>{{seller_company_name}}</strong>.

Payment Terms: {{payment_terms}}
Missing Token Example: {{unknown_token}}
`;

const data = {
  buyer_company_name: "Refex Renewables & Infrastructure Limited",
  seller_company_name: "Test Vendor Private Limited",
  payment_terms: "100% after successful completion"
};

const rendered = renderTemplate(template, data, { missingTokenMode: "keep" });
const tokens = findTemplateTokens(template);

console.log(JSON.stringify({
  ok: true,
  tokens,
  rendered
}, null, 2));
