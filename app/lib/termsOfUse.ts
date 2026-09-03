// Source of truth for the Terms of Use modal (index.tsx) and, eventually,
// Settings > Legal. Each section is either plain paragraphs or a mix of
// paragraphs and bullet lists, rendered in that order by LegalDocumentModal.
import { bullets, LegalSection, text } from './legalContent';

export const TERMS_OF_USE_EFFECTIVE_DATE = 'August 4, 2026';

export const TERMS_OF_USE_INTRO =
  'Welcome to Grrunch ("Grrunch," "we," "our," or "us"). These Terms of Use ("Terms") govern your access to and use of the Grrunch mobile application and related services (collectively, the "Service").\n\n' +
  'By creating an account or using Grrunch, you agree to be bound by these Terms. If you do not agree, please do not use the Service.';

export const TERMS_OF_USE_SECTIONS: LegalSection[] = [
  {
    title: '1. About Grrunch',
    blocks: [
      text(
        'Grrunch helps users discover affordable recipes based on current grocery flyer deals, compare promotions from participating retailers, build grocery lists, and save money on groceries.'
      ),
      text(
        'Over time, Grrunch may introduce additional features, including artificial intelligence, personalized recommendations, analytics, and other shopping-related services.'
      ),
    ],
  },
  {
    title: '2. Eligibility',
    blocks: [
      text('You must be at least 13 years old, or the minimum age required in your province or territory, to use Grrunch.'),
      text(
        'If you are under the age of majority in your jurisdiction, you may only use the Service with the permission of a parent or legal guardian.'
      ),
    ],
  },
  {
    title: '3. Your Account',
    blocks: [
      text('You are responsible for:'),
      bullets([
        'maintaining the confidentiality of your account;',
        'safeguarding your password or authentication credentials;',
        'ensuring the information you provide is accurate;',
        'notifying us if you believe your account has been compromised.',
      ]),
      text('You remain responsible for all activity occurring under your account.'),
    ],
  },
  {
    title: '4. Permitted Use',
    blocks: [
      text(
        'You may use Grrunch solely for personal, lawful, and non-commercial purposes unless otherwise authorized by us.'
      ),
      text('You agree not to:'),
      bullets([
        'violate any applicable laws;',
        'interfere with the operation of the Service;',
        'attempt unauthorized access to our systems;',
        'scrape or systematically copy our content;',
        'reverse engineer the Service;',
        'upload malicious software;',
        'misuse automated tools without permission.',
      ]),
    ],
  },
  {
    title: '5. Grocery Prices and Flyer Information',
    blocks: [
      text('Grrunch displays grocery promotions from participating retailers for informational purposes.'),
      text('Although we strive for accuracy:'),
      bullets(['prices may change;', 'promotions may expire;', 'availability varies by location;', 'stores may correct pricing errors.']),
      text('The price charged by the retailer at the time of purchase always prevails.'),
      text('Grrunch does not guarantee the accuracy, completeness, or availability of any advertised promotion.'),
    ],
  },
  {
    title: '6. Recipes',
    blocks: [
      text('Recipes provided through Grrunch are intended for informational purposes only.'),
      text('Ingredient availability, pricing, nutritional values, cooking times, and dietary suitability may vary.'),
      text('Users remain responsible for:'),
      bullets([
        'checking ingredients;',
        'verifying allergens;',
        'following safe food handling practices;',
        'determining whether a recipe meets their dietary requirements.',
      ]),
      text('Grrunch does not provide medical or nutritional advice.'),
    ],
  },
  {
    title: '7. Grocery Lists',
    blocks: [
      text('Grrunch allows users to create, organize, and manage grocery lists.'),
      text('You retain ownership of the grocery lists you create.'),
      text(
        'By storing them through the Service, you grant Grrunch the limited rights necessary to host, synchronize, back up, and display that content within your account.'
      ),
    ],
  },
  {
    title: '8. User Content',
    blocks: [
      text('You retain ownership of any content you submit to Grrunch.'),
      text('You represent that:'),
      bullets([
        'you have the right to submit the content;',
        "your content does not infringe another person's rights;",
        'your content complies with applicable laws.',
      ]),
      text(
        'You grant Grrunch a worldwide, non-exclusive, royalty-free license to host, store, process, reproduce, and display your content solely for operating and improving the Service.'
      ),
    ],
  },
  {
    title: '9. Intellectual Property',
    blocks: [
      text(
        'The Grrunch name, logo, branding, software, interface, recipes (where owned by Grrunch), graphics, text, and other original content are protected by intellectual property laws.'
      ),
      text(
        'Except as expressly permitted, you may not copy, reproduce, distribute, or create derivative works from our content without written permission.'
      ),
      text("Third-party trademarks, retailer names, and logos remain the property of their respective owners."),
    ],
  },
  {
    title: '10. Data and Product Improvement',
    blocks: [
      text('To operate and improve Grrunch, we collect information about how the Service is used.'),
      text('This information helps us:'),
      bullets([
        'improve recipes;',
        'improve grocery recommendations;',
        'enhance shopping experiences;',
        'optimize product features;',
        'understand grocery and pricing trends;',
        'develop new products and services.',
      ]),
      text(
        'Where permitted by law, we may produce aggregated and anonymized analytics, reports, market insights, and statistical information derived from activity within Grrunch.'
      ),
      text('These insights are designed so they do not identify individual users.'),
      text(
        'Nothing in these Terms transfers ownership of your personal information to Grrunch beyond the rights necessary to provide the Service, as described in our Privacy Policy.'
      ),
    ],
  },
  {
    title: '11. Artificial Intelligence',
    blocks: [
      text(
        'Certain features may use artificial intelligence to generate recommendations, shopping suggestions, recipes, summaries, or other content.'
      ),
      text('AI-generated content may occasionally contain inaccuracies.'),
      text(
        'You should exercise your own judgment before relying on recommendations involving purchases, nutrition, allergies, or food preparation.'
      ),
    ],
  },
  {
    title: '12. Third-Party Services',
    blocks: [
      text(
        'Grrunch may integrate with or reference third-party services, including grocery retailers, authentication providers, payment providers, mapping services, or other platforms.'
      ),
      text('We are not responsible for the products, services, pricing, or policies of third parties.'),
      text('Your interactions with those services are governed by their own terms and privacy policies.'),
    ],
  },
  {
    title: '13. Availability',
    blocks: [
      text('We continually improve Grrunch.'),
      text('We may:'),
      bullets(['modify features;', 'introduce new functionality;', 'discontinue features;', 'perform maintenance;', 'temporarily suspend access.']),
      text('We do not guarantee uninterrupted availability.'),
    ],
  },
  {
    title: '14. Privacy',
    blocks: [
      text('Your use of Grrunch is also governed by our Privacy Policy.'),
      text(
        'The Privacy Policy explains what information we collect, why we collect it, how we protect it, and the choices available to you.'
      ),
    ],
  },
  {
    title: '15. Limitation of Liability',
    blocks: [
      text('To the fullest extent permitted by applicable law, Grrunch is provided "as is" and "as available."'),
      text(
        'We make no warranties regarding uninterrupted availability, accuracy of pricing, completeness of recipe information, or suitability for any particular purpose.'
      ),
      text(
        'To the maximum extent permitted by law, Grrunch shall not be liable for indirect, incidental, consequential, special, or punitive damages arising from the use of the Service.'
      ),
      text('Nothing in these Terms excludes liability that cannot legally be excluded under applicable Canadian law.'),
    ],
  },
  {
    title: '16. Indemnification',
    blocks: [
      text('You agree to indemnify and hold harmless Grrunch, its officers, employees, contractors, and affiliates from claims arising from:'),
      bullets([
        'your misuse of the Service;',
        'your violation of these Terms;',
        'your violation of applicable laws;',
        "your infringement of another person's rights.",
      ]),
    ],
  },
  {
    title: '17. Suspension and Termination',
    blocks: [
      text('We may suspend or terminate accounts that:'),
      bullets(['violate these Terms;', 'threaten the security of the Service;', 'engage in fraudulent or abusive activity;', 'misuse Grrunch.']),
      text('You may stop using Grrunch and delete your account at any time.'),
    ],
  },
  {
    title: '18. Changes to These Terms',
    blocks: [
      text('We may update these Terms from time to time.'),
      text('When material changes are made, we will provide notice through the Service or by other reasonable means.'),
      text('Continued use of Grrunch after updated Terms become effective constitutes acceptance of the revised Terms.'),
    ],
  },
  {
    title: '19. Governing Law',
    blocks: [
      text(
        'These Terms are governed by the laws of Canada and the applicable laws of the Province in which Grrunch operates, without regard to conflict-of-law principles.'
      ),
      text(
        'Any disputes shall be brought before the courts having jurisdiction in that province unless otherwise required by applicable law.'
      ),
    ],
  },
  {
    title: '20. Contact',
    blocks: [
      text('Questions regarding these Terms may be directed to:'),
      text('Grrunch\nEmail: support@grrunch.com'),
    ],
  },
];

export const TERMS_OF_USE_OUTRO =
  'Thank you for using Grrunch and for helping us make grocery shopping smarter, more affordable, and more sustainable.';
