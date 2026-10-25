import { describe, it, expect } from 'vitest';
import {
  cleanTemplateParam,
  renderTemplate,
  templateParameters,
  WHATSAPP_TEMPLATES,
} from '../../modules/notifications/whatsapp-templates.js';
import { toWhatsAppNumber } from '../../modules/notifications/adapters/meta-cloud-whatsapp.adapter.js';
import { optOutCommand } from '../../modules/whatsapp-assistant/whatsapp-assistant.service.js';
import { planStatusText, rupees } from '../../modules/notifications/notification.subscribers.js';

describe('WhatsApp templates', () => {
  it('numbers every variable in its body, in order', () => {
    for (const [name, template] of Object.entries(WHATSAPP_TEMPLATES)) {
      const used = [...template.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
      expect(used, name).toEqual(template.params.map((_p, i) => i + 1));
    }
  });

  it('never starts or ends with a variable, which Meta rejects', () => {
    for (const [name, template] of Object.entries(WHATSAPP_TEMPLATES)) {
      expect(template.body, name).not.toMatch(/^\{\{\d+\}\}/);
      expect(template.body, name).not.toMatch(/\{\{\d+\}\}\s*$/);
    }
  });

  it('puts parameters in template order, whatever order they were given in', () => {
    expect(
      templateParameters('fee_payment_confirmation', {
        balance: '₹0',
        receipt: 'R-1',
        student: 'Riya',
        amount: '₹500',
        institute: 'Sharma Classes',
        link: 'https://x.test/r/1',
      }),
    ).toEqual(['Sharma Classes', '₹500', 'Riya', 'R-1', '₹0', 'https://x.test/r/1']);
  });

  it('cleans text Meta would reject', () => {
    expect(cleanTemplateParam('Line one\n\nLine  two\t')).toBe('Line one Line two');
    expect(cleanTemplateParam('')).toBe('-');
    expect(cleanTemplateParam('x'.repeat(700))).toHaveLength(600);
  });

  it('renders the text a parent reads', () => {
    expect(
      renderTemplate('institute_notice', { institute: 'Sharma Classes', title: 'Holiday', details: 'Closed\nMonday' }),
    ).toBe('Notice from Sharma Classes: Holiday. Details: Closed Monday Thank you.');
  });

  it('describes the plan and money plainly', () => {
    expect(planStatusText(3)).toBe('ends in 3 days');
    expect(planStatusText(1)).toBe('ends tomorrow');
    expect(planStatusText(0)).toBe('has ended. Your data is safe');
    expect(rupees(12500)).toBe('₹12,500');
    expect(rupees(99.5)).toBe('₹99.5');
  });
});

describe('WhatsApp numbers and STOP', () => {
  it('adds the India country code Meta needs', () => {
    expect(toWhatsAppNumber('98765 43210')).toBe('919876543210');
    expect(toWhatsAppNumber('09876543210')).toBe('919876543210');
    expect(toWhatsAppNumber('+91 98765-43210')).toBe('919876543210');
  });

  it('understands STOP and START however they are typed', () => {
    expect(optOutCommand(' stop ')).toBe('OPT_OUT');
    expect(optOutCommand('Stop messages')).toBe('OPT_OUT');
    expect(optOutCommand('STOP.')).toBe('OPT_OUT');
    expect(optOutCommand('start')).toBe('OPT_IN');
    expect(optOutCommand('please stop the fee reminder')).toBeNull();
  });
});

describe('study material template', () => {
  it('names the title and the link in order, and never starts or ends on a variable', () => {
    expect(templateParameters('material_shared', { institute: 'Sharma', student: 'Riya', title: 'Light notes', link: 'https://x.test/p/1' })).toEqual([
      'Sharma',
      'Riya',
      'Light notes',
      'https://x.test/p/1',
    ]);
  });
});
