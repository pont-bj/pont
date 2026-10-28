import defaultMdxComponents from "fumadocs-ui/mdx";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { TypeTable } from "fumadocs-ui/components/type-table";
import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import type { MDXComponents } from "mdx/types";
import { Mermaid } from "@/components/mermaid";
import { Figure } from "@/components/figure";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return { ...defaultMdxComponents, Tab, Tabs, Step, Steps, TypeTable, Accordion, Accordions, Mermaid, Figure, ...components };
}
