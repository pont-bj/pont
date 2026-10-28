import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Confidentialité — Pont",
  description:
    "Quelles données Pont collecte via la liste d'attente, pourquoi, combien de temps, et comment exercer vos droits.",
  alternates: { canonical: "/confidentialite" },
  robots: { index: true, follow: true },
};

const MISE_A_JOUR = "28 octobre 2026";
const CONTACT = "pro@aboudouzinsou.com";

export default function Confidentialite() {
  return (
    <main className="mx-auto w-full max-w-[720px] px-5 py-14 text-[15px] leading-relaxed text-zinc-700 sm:py-20">
      <Link href="/" className="text-sm text-zinc-500 hover:text-encre">
        &larr; Retour à l&apos;accueil
      </Link>

      <h1 className="mt-6 font-titre text-3xl font-semibold text-encre sm:text-4xl">
        Politique de confidentialité
      </h1>
      <p className="mt-2 text-sm text-zinc-500">Dernière mise à jour : {MISE_A_JOUR}</p>

      <p className="mt-6 rounded-lg border border-bordure bg-white p-4 text-sm text-zinc-600">
        Ce texte décrit le fonctionnement actuel du site et de la liste d&apos;attente. Il est en cours de validation
        juridique, notamment au regard de la réglementation béninoise sur la protection des données personnelles. Il
        peut être modifié ; la date ci-dessus fait foi.
      </p>

      <Section titre="Qui est responsable ?">
        <p>
          Le responsable du traitement est François Mawutô Aboudou ZINSOU, éditeur du projet Pont (nom de code).
          Contact unique pour toute question sur vos données :{" "}
          <a className="text-indigo underline" href={`mailto:${CONTACT}`}>
            {CONTACT}
          </a>
          .
        </p>
      </Section>

      <Section titre="Données collectées par le formulaire">
        <p>Lorsque vous rejoignez la liste d&apos;attente, nous enregistrons :</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>votre adresse email (mise en minuscules) ;</li>
          <li>
            votre profil, choisi dans le formulaire : développeur, fondateur de fintech, agence ou autre ;
          </li>
          <li>votre position dans la liste (un numéro) ;</li>
          <li>
            l&apos;origine de votre visite, seulement si le lien contient <code>utm_source</code> ou <code>ref</code>{" "}
            (40 caractères au maximum) ;
          </li>
          <li>la date et l&apos;heure de votre consentement.</li>
        </ul>
        <p className="mt-3">
          Pour limiter les abus (plus de 10 tentatives par heure), nous calculons aussi une empreinte irréversible de
          votre adresse IP, mélangée à un secret du serveur. Votre adresse IP elle-même n&apos;est pas enregistrée.
        </p>
        <p className="mt-3">
          Le champ de consentement est obligatoire : sans lui, aucune inscription n&apos;est possible.
        </p>
      </Section>

      <Section titre="Finalité">
        <p>
          Vos données servent uniquement à vous prévenir de l&apos;ouverture de l&apos;accès à Pont et à vous
          envoyer des informations sur le projet. Elles ne sont ni vendues ni cédées à des tiers à des fins
          commerciales.
        </p>
      </Section>

      <Section titre="Base du traitement">
        <p>Votre consentement, donné en cochant la case du formulaire. Vous pouvez le retirer à tout moment.</p>
      </Section>

      <Section titre="Conservation">
        <p>
          Votre inscription est conservée jusqu&apos;à votre demande de suppression ou, à défaut, jusqu&apos;à la fin
          du projet de liste d&apos;attente. Nous prévoyons de supprimer la liste au plus tard 24 mois après votre
          inscription si vous n&apos;avez pas été recontacté. Les compteurs anti-abus (empreintes) ne servent que
          sur une fenêtre d&apos;une heure et ne sont conservés que pour cet usage.
        </p>
      </Section>

      <Section titre="Vos droits">
        <p>
          Vous pouvez demander à accéder à vos données, les faire rectifier ou supprimer, et retirer votre
          consentement, en écrivant à{" "}
          <a className="text-indigo underline" href={`mailto:${CONTACT}`}>
            {CONTACT}
          </a>{" "}
          depuis l&apos;adresse inscrite. Nous répondons dans un délai raisonnable, visé à 30 jours au plus. Vous
          pouvez aussi vous adresser à l&apos;autorité béninoise de protection des données personnelles.
        </p>
      </Section>

      <Section titre="Hébergement et sous-traitants">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Vercel</strong> héberge le site et exécute les actions serveur (le formulaire passe par ses
            serveurs).
          </li>
          <li>
            <strong>Convex</strong> héberge la base de données qui contient la liste d&apos;attente.
          </li>
        </ul>
        <p className="mt-3">
          Ces prestataires peuvent traiter les données hors du Bénin. Ils agissent pour notre compte et selon leurs
          propres conditions.
        </p>
      </Section>

      <Section titre="Cookies et suivi">
        <p>
          Ce site ne dépose aucun cookie de suivi, n&apos;utilise aucun outil de mesure d&apos;audience ni de
          publicité, et n&apos;intègre aucun traceur tiers. Les polices sont servies depuis le site lui-même. Les
          journaux techniques habituels de l&apos;hébergeur (adresse IP, requête) peuvent exister pour la sécurité et
          le bon fonctionnement.
        </p>
      </Section>

      <Section titre="Sécurité">
        <p>
          L&apos;accès à la base est réservé au serveur du site, protégé par un secret, et les inscriptions sont
          validées avant enregistrement. Aucun système n&apos;étant infaillible, signalez-nous tout problème à{" "}
          <a className="text-indigo underline" href={`mailto:${CONTACT}`}>
            {CONTACT}
          </a>
          .
        </p>
      </Section>
    </main>
  );
}

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="font-titre text-xl font-semibold text-encre">{titre}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
