<!--
  Every component in src/lib/components/ui/ (and the form pieces built on them), in the current
  theme, with the mode and text size to try. Development only: `npm run dev`, then /components.
  The words here are samples, so they don't go through t().
-->
<script lang="ts">
  import { resolve } from '$app/paths';
  import PasswordInput from '#lib/components/PasswordInput.svelte';
  import CodeInput from '#lib/components/CodeInput.svelte';
  import FormError from '#lib/components/FormError.svelte';
  import Spinner from '#lib/components/Spinner.svelte';
  import Avatar from '#lib/components/Avatar.svelte';
  import Badge from '#lib/components/ui/Badge.svelte';
  import Breadcrumbs from '#lib/components/ui/Breadcrumbs.svelte';
  import Button from '#lib/components/ui/Button.svelte';
  import Carousel from '#lib/components/ui/Carousel.svelte';
  import ChatBubble from '#lib/components/ui/ChatBubble.svelte';
  import Checkbox from '#lib/components/ui/Checkbox.svelte';
  import Collapse from '#lib/components/ui/Collapse.svelte';
  import Countdown from '#lib/components/ui/Countdown.svelte';
  import Divider from '#lib/components/ui/Divider.svelte';
  import Dock from '#lib/components/ui/Dock.svelte';
  import Drawer from '#lib/components/ui/Drawer.svelte';
  import Dropdown from '#lib/components/ui/Dropdown.svelte';
  import Field from '#lib/components/ui/Field.svelte';
  import FileInput from '#lib/components/ui/FileInput.svelte';
  import Footer from '#lib/components/ui/Footer.svelte';
  import Hero from '#lib/components/ui/Hero.svelte';
  import Indicator from '#lib/components/ui/Indicator.svelte';
  import Input from '#lib/components/ui/Input.svelte';
  import Kbd from '#lib/components/ui/Kbd.svelte';
  import List from '#lib/components/ui/List.svelte';
  import Menu from '#lib/components/ui/Menu.svelte';
  import Modal from '#lib/components/ui/Modal.svelte';
  import Navbar from '#lib/components/ui/Navbar.svelte';
  import Notice from '#lib/components/ui/Notice.svelte';
  import Pagination from '#lib/components/ui/Pagination.svelte';
  import Panel from '#lib/components/ui/Panel.svelte';
  import Progress from '#lib/components/ui/Progress.svelte';
  import RadialProgress from '#lib/components/ui/RadialProgress.svelte';
  import RadioGroup from '#lib/components/ui/RadioGroup.svelte';
  import Range from '#lib/components/ui/Range.svelte';
  import Rating from '#lib/components/ui/Rating.svelte';
  import Segmented from '#lib/components/ui/Segmented.svelte';
  import Select from '#lib/components/ui/Select.svelte';
  import Skeleton from '#lib/components/ui/Skeleton.svelte';
  import Stat from '#lib/components/ui/Stat.svelte';
  import Stats from '#lib/components/ui/Stats.svelte';
  import Status from '#lib/components/ui/Status.svelte';
  import Steps from '#lib/components/ui/Steps.svelte';
  import Swap from '#lib/components/ui/Swap.svelte';
  import Table from '#lib/components/ui/Table.svelte';
  import Tabs from '#lib/components/ui/Tabs.svelte';
  import Textarea from '#lib/components/ui/Textarea.svelte';
  import Timeline from '#lib/components/ui/Timeline.svelte';
  import Toggle from '#lib/components/ui/Toggle.svelte';
  import Tooltip from '#lib/components/ui/Tooltip.svelte';
  import { toast } from '#lib/components/ui/toast.svelte.ts';

  let mode = $state<'light' | 'dark'>(
    globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );
  let text = $state<'sm' | 'md' | 'lg' | 'xl'>('md');

  $effect(() => {
    const r = document.documentElement;
    r.setAttribute('data-mode', mode);
    if (text === 'md') r.removeAttribute('data-text');
    else r.setAttribute('data-text', text);
  });

  let email = $state('ada@example.com');
  let bad = $state('not-an-email');
  let notes = $state('Multi-line text goes here.');
  let role = $state('member');
  let password = $state('correct horse');
  let code = $state('123456');
  let filter = $state<'all' | 'open' | 'done'>('open');
  let plan = $state<'free' | 'team' | 'org'>('team');
  let terms = $state(true);
  let weekly = $state(false);
  let volume = $state(40);
  let stars = $state(3);
  let tab = $state<'general' | 'members' | 'billing'>('general');
  let page = $state(4);
  let modal = $state(false);
  let drawer = $state(false);
  let muted = $state(false);
  let seconds = $state(42);

  $effect(() => {
    const timer = setInterval(() => (seconds = seconds > 0 ? seconds - 1 : 59), 1000);
    return () => clearInterval(timer);
  });

  const people = [
    { name: 'Ada Lovelace', email: 'ada@example.com', photoUrl: null },
    { name: 'Alan Turing', email: 'alan@example.com', photoUrl: null },
    { name: 'Grace Hopper', email: 'grace@example.com', photoUrl: null },
  ];
  const slides = ['#0b64dd', '#09724d', '#825803', '#c61e25'];
</script>

<svelte:head><title>Components</title></svelte:head>

{#snippet homeIcon()}<span>⌂</span>{/snippet}
{#snippet listIcon()}<span>☰</span>{/snippet}
{#snippet userIcon()}<span>◉</span>{/snippet}

<main id="main" class="page">
  <header class="top">
    <h1>Components</h1>
    <p class="muted">
      Every component in <code>src/lib/components/ui/</code>, in the Daisy theme. Development only.
    </p>
    <div class="row">
      <Segmented
        legend="Mode"
        options={[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
        bind:value={mode}
      />
      <Segmented
        legend="Text size"
        options={[
          { value: 'sm', label: 'Small' },
          { value: 'md', label: 'Default' },
          { value: 'lg', label: 'Large' },
          { value: 'xl', label: 'Larger' },
        ]}
        bind:value={text}
      />
    </div>
  </header>

  <Panel
    title="Button"
    description="plain, primary, danger, danger-solid, link, outline, soft, ghost, dash; xs, small, md, lg; wide; square; disabled; as a link."
  >
    <div class="row">
      <Button>Plain</Button>
      <Button variant="primary">Primary</Button>
      <Button variant="danger">Danger</Button>
      <Button variant="danger-solid">Danger solid</Button>
      <Button variant="link">Link</Button>
    </div>
    <div class="row">
      <Button variant="outline">Outline</Button>
      <Button variant="soft">Soft</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="dash">Dash</Button>
      <Button square aria-label="Add">+</Button>
    </div>
    <div class="row">
      <Button size="xs">Extra small</Button>
      <Button size="small">Small</Button>
      <Button>Medium</Button>
      <Button size="lg">Large</Button>
      <Button disabled>Disabled</Button>
      <Button href="#main">A link as a button</Button>
    </div>
    <Button variant="primary" wide>Wide primary</Button>
  </Panel>

  <Panel title="Panel" description="DaisyUI's card: a title, a description and actions.">
    {#snippet actions()}<Button size="small">Action</Button>{/snippet}
    <p>Panel content.</p>
  </Panel>

  <Panel title="Field, Input, Textarea, Select, FileInput, Range">
    <Field label="Email" hint="We'll send a code."><Input type="email" bind:value={email} /></Field>
    <Field label="Invalid" invalid describedby="gallery-error"><Input bind:value={bad} /></Field>
    <FormError id="gallery-error" message="That doesn't look like an email address." />
    <Field label="Disabled"><Input value="Can't change this" disabled /></Field>
    <Field label="Notes"><Textarea rows={3} bind:value={notes} /></Field>
    <Field label="Role">
      <Select bind:value={role}>
        <option value="owner">Owner</option>
        <option value="member">Member</option>
        <option value="viewer">Viewer</option>
      </Select>
    </Field>
    <Field label="Attachment"><FileInput /></Field>
    <Field label="Volume" hint="{volume}%"><Range bind:value={volume} min={0} max={100} /></Field>
  </Panel>

  <Panel title="PasswordInput, CodeInput">
    <PasswordInput id="gallery-password" bind:value={password} hint="At least 8 characters." />
    <CodeInput id="gallery-code" bind:value={code} />
  </Panel>

  <Panel title="Segmented, RadioGroup, Checkbox, Toggle, Rating">
    <Segmented
      legend="Show"
      options={[
        { value: 'all', label: 'All' },
        { value: 'open', label: 'Open' },
        { value: 'done', label: 'Done' },
      ]}
      bind:value={filter}
    />
    <RadioGroup
      legend="Plan"
      options={[
        { value: 'free', label: 'Free', hint: 'One person, one device.' },
        { value: 'team', label: 'Team', hint: 'Up to 20 people.' },
        { value: 'org', label: 'Organisation', hint: 'Talk to us.', disabled: true },
      ]}
      bind:value={plan}
    />
    <Checkbox bind:checked={terms} label="I agree to the terms" hint="You can read them any time." />
    <Toggle bind:checked={weekly} label="Weekly summary" hint="Every Monday morning." />
    <Rating legend="Your rating" bind:value={stars} />
    <p class="row">Shown: <Rating legend="Average" value={4} readonly size="sm" /></p>
  </Panel>

  <Panel title="Badge, Notice, Status, Kbd, Indicator, Divider, Spinner, Skeleton">
    <p>
      Ada Lovelace
      <Badge>Accent</Badge><Badge tone="danger">Danger</Badge><Badge tone="success">Success</Badge><Badge
        tone="warning">Warning</Badge
      ><Badge tone="info">Info</Badge><Badge tone="neutral">Neutral</Badge><Badge tone="outline"
        >Outline</Badge
      ><Badge tone="plain">Plain</Badge>
    </p>
    <Notice>You were signed out on this device. Sign in again to carry on.</Notice>
    <Notice tone="info">Your team has 3 invitations waiting.</Notice>
    <Notice tone="success">Saved.</Notice>
    <Notice tone="error">Couldn't save: the connection dropped.</Notice>
    <Notice tone="warning" solid>The same, solid.</Notice>
    <p class="row">
      <Status tone="success" label="Online" /> Online
      <Status tone="warning" label="Paused" /> Paused
      <Status tone="error" label="Failing" pulse /> Failing
    </p>
    <p>Search with <Kbd>Ctrl</Kbd> + <Kbd>K</Kbd>.</p>
    <p class="row">
      <Indicator value="3" label="3 unread"><Button>Inbox</Button></Indicator>
      <Indicator label="New" tone="error"
        ><Avatar
          user={{ name: 'Ada Lovelace', email: 'ada@example.com', photoUrl: null }}
          size={40}
        /></Indicator
      >
    </p>
    <Divider>or</Divider>
    <p class="row"><Spinner /> Loading…</p>
    <div class="row">
      <Skeleton width="3rem" height="3rem" round />
      <div class="stack skeletons"><Skeleton width="12rem" /><Skeleton width="8rem" /></div>
    </div>
  </Panel>

  <Panel title="Toast, Tooltip, Dropdown, Menu, Modal, Drawer, Swap">
    <div class="row">
      <Button onclick={() => toast('Saved.', { tone: 'success' })}>Toast</Button>
      <Button onclick={() => toast("Couldn't save.", { tone: 'error' })}>Error toast</Button>
      <Tooltip text="Copied links work for 7 days"><Button>Tooltip</Button></Tooltip>
      <Dropdown label="Dropdown">
        <Menu>
          <li class="menu-title">Team</li>
          <li><button type="button">Rename</button></li>
          <li><button type="button">Leave</button></li>
        </Menu>
      </Dropdown>
      <Button onclick={() => (modal = true)}>Modal</Button>
      <Button onclick={() => (drawer = true)}>Drawer</Button>
      <Swap label="Mute" bind:active={muted}>
        {#snippet on()}🔇{/snippet}
        {#snippet off()}🔊{/snippet}
      </Swap>
    </div>
    <Menu class="menu-box">
      <li><a href="#main" class="menu-active">This page</a></li>
      <li><a href="#main">Another page</a></li>
      <li><button type="button">An action</button></li>
    </Menu>
  </Panel>

  <Modal title="Rename team" bind:open={modal}>
    <Field label="Name"><Input value="Ward 7" /></Field>
    {#snippet actions()}
      <Button onclick={() => (modal = false)}>Cancel</Button>
      <Button variant="primary" onclick={() => (modal = false)}>Save</Button>
    {/snippet}
  </Modal>

  <Drawer title="Filters" bind:open={drawer} side="end">
    <Menu>
      <li><button type="button">Open</button></li>
      <li><button type="button">Done</button></li>
    </Menu>
  </Drawer>

  <Panel title="Tabs, Collapse, Breadcrumbs, Pagination, Steps">
    <Tabs
      label="Settings"
      tabs={[
        { id: 'general', label: 'General' },
        { id: 'members', label: 'Members' },
        { id: 'billing', label: 'Billing' },
      ]}
      bind:value={tab}
    >
      {#snippet panel(id)}<p>The {id} tab.</p>{/snippet}
    </Tabs>
    <Tabs
      label="Look: box"
      look="box"
      tabs={[
        { id: 'general', label: 'General' },
        { id: 'members', label: 'Members' },
        { id: 'billing', label: 'Billing' },
      ]}
      bind:value={tab}
    >
      {#snippet panel(id)}<p>The same, as a box: {id}.</p>{/snippet}
    </Tabs>
    <div>
      <Collapse title="What happens to my data?" group="faq" open
        >It stays on your devices until it syncs.</Collapse
      >
      <Collapse title="Can I work offline?" group="faq">Yes; changes wait and send when you're back.</Collapse
      >
      <Collapse title="Who can see my team?" group="faq">Only its members.</Collapse>
    </div>
    <Breadcrumbs
      items={[
        { label: 'Admin', href: resolve('admin') },
        { label: 'People', href: resolve('admin/people') },
        { label: 'Ada Lovelace' },
      ]}
    />
    <Pagination bind:page pages={12} />
    <Steps steps={['Account', 'Team', 'Invite', 'Done']} current={1} />
  </Panel>

  <Panel title="Progress, RadialProgress, Countdown, Stats">
    <Progress label="Uploading" value={60} />
    <Progress label="Working" />
    <div class="row">
      <RadialProgress label="Storage used" value={72} />
      <RadialProgress label="Score" value={35} tone="warning" />
      <span>Next sync in <Countdown value={seconds} label="{seconds} seconds" /> s</span>
    </div>
    <Stats>
      <Stat title="People" value={1204} description="21 more than last week" />
      <Stat title="Teams" value={87} />
      <Stat title="Changes today" value={15330} />
    </Stats>
  </Panel>

  <Panel title="List, Table">
    <List>
      {#each people as p, i (p.email)}
        <li>
          <span class="row"
            ><Avatar user={p} size={32} /><span class="title">{p.name}</span>{#if i === 0}<Badge>You</Badge
              >{/if}</span
          >
          <span class="muted small">{p.email}</span>
          <Button size="small" variant={i === 2 ? 'danger' : 'plain'}>{i === 2 ? 'Remove' : 'Edit'}</Button>
        </li>
      {/each}
    </List>
    <Table zebra>
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead>
      <tbody>
        {#each people as p, i (p.email)}
          <tr
            ><td>{p.name}</td><td>{p.email}</td><td>{['Owner', 'Member', 'Viewer'][i]}</td><td
              >{i + 1} Nov 2026</td
            ></tr
          >
        {/each}
      </tbody>
    </Table>
  </Panel>

  <Panel title="Timeline, ChatBubble, Carousel">
    <Timeline
      items={[
        { when: '9:02', title: 'Ordered', text: 'By Ada' },
        { when: '11:40', title: 'Packed' },
        { title: 'Sent', done: false },
      ]}
    />
    <div>
      <ChatBubble name="Alan" time="9:02">Is the ward round at ten?</ChatBubble>
      <ChatBubble side="end" name="You" time="9:03" tone="primary" footer="Seen">Yes, in room 4.</ChatBubble>
    </div>
    <Carousel label="Colours" items={slides} width="60%">
      {#snippet item(colour, i)}<div class="slide" style:background={colour}>Slide {i + 1}</div>{/snippet}
    </Carousel>
  </Panel>

  <Panel title="Navbar, Hero, Footer, Dock">
    <Navbar>
      {#snippet start()}<strong>Starter</strong>{/snippet}
      {#snippet end()}<Button size="small" variant="ghost">Sign in</Button><Button
          size="small"
          variant="primary">Start</Button
        >{/snippet}
    </Navbar>
    <Hero
      title="Plan the day you actually have"
      lead="Add what you want to do; the rest of the day moves with it."
    >
      <Button variant="primary">Get started</Button><Button>Learn more</Button>
    </Hero>
    <Footer
      groups={[
        {
          title: 'Product',
          links: [
            { label: 'Home', href: resolve('') },
            { label: 'Contact', href: resolve('contact') },
          ],
        },
        {
          title: 'Legal',
          links: [
            { label: 'Privacy', href: resolve('privacy') },
            { label: 'Terms', href: resolve('terms') },
          ],
        },
      ]}
    />
    <div class="dock-frame">
      <Dock
        label="Main"
        items={[
          { label: 'Home', href: '#main', icon: homeIcon, current: true },
          { label: 'Lists', href: '#lists', icon: listIcon },
          { label: 'You', href: '#you', icon: userIcon },
        ]}
      />
    </div>
  </Panel>

  <Panel title="Text">
    <h1>Heading 1</h1>
    <h2>Heading 2</h2>
    <h3>Heading 3</h3>
    <p>Body text with <a href="#main">a link</a>, <strong>strong</strong> and <code>code</code>.</p>
    <p class="muted">Muted text.</p>
    <p class="hint">A hint.</p>
    <p class="error">An error.</p>
    <p class="success">A success.</p>
  </Panel>
</main>

<style>
  .page {
    max-width: var(--page-width);
    margin: 0 auto;
    padding: var(--space-6) var(--space-4);
  }

  .top {
    margin-bottom: var(--space-5);
  }

  .top p {
    margin-block: var(--space-1) var(--space-3);
  }

  .skeletons {
    gap: var(--space-2);
  }

  .slide {
    display: grid;
    place-items: center;
    width: 100%;
    height: 8rem;
    border-radius: var(--radius-box);
    color: #fff;
  }

  /* The dock is fixed to the screen's foot; here it sits in a frame instead. */
  .dock-frame {
    position: relative;
    height: 4.5rem;
    overflow: hidden;
    border: var(--border) dashed var(--color-base-300);
    border-radius: var(--radius-box);
    transform: translateZ(0);
  }

  .page :global(.menu-box) {
    width: 16rem;
    background: var(--color-base-200);
    border-radius: var(--radius-box);
  }
</style>
