"""
Management command: seed_chat_data
Creates realistic-looking channels and DM conversations for dev/demo use.

Usage:
    python manage.py seed_chat_data
    python manage.py seed_chat_data --project 1
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
import random

from chat.models import Chat, ChatParticipant, Message

User = get_user_model()


# ── Seed data ────────────────────────────────────────────────────────────────

CHANNELS = [
    {
        'name': 'general',
        'topic': 'Day-to-day team chat',
        'description': 'General conversation for the whole team.',
    },
    {
        'name': 'design',
        'topic': 'Design reviews & feedback',
        'description': 'Share mockups, critique work, and align on visual direction.',
    },
    {
        'name': 'marketing',
        'topic': 'Q3 campaign planning · deadline Jul 1',
        'description': 'Campaign strategy, copy, and launch coordination.',
    },
    {
        'name': 'engineering',
        'topic': 'Sprint 12 · ends Jun 7',
        'description': 'Engineering discussions, PRs, and incident reports.',
    },
    {
        'name': 'random',
        'topic': None,
        'description': 'Off-topic banter, memes, and Friday vibes.',
    },
    {
        'name': 'announcements',
        'topic': 'Official company-wide updates only',
        'description': 'Read-only announcements from leadership.',
    },
]

# (channel_name, sender_username, minutes_ago, content)
MESSAGES = [
    # general
    ('general', 'zenobia',      500, 'Good morning everyone 👋'),
    ('general', 'noname',       490, 'Morning! Anyone around for a quick sync?'),
    ('general', 'alectoxic',    480, 'I can jump on in 10 mins'),
    ('general', 'zenobia',      470, 'Perfect, I\'ll send a link'),
    ('general', 'SomeUser',     440, 'Heads up — the staging env is down, looking into it'),
    ('general', 'anotherUser',  435, 'Thanks for the heads up 🙏'),
    ('general', 'alectoxic',    430, 'Staging is back up, was a bad config deploy. All good now'),
    ('general', 'noname',       420, '🎉'),
    ('general', 'userUser',     300, 'Anyone else getting a 502 on the dashboard?'),
    ('general', 'alectoxic',    295, '@userUser works fine on my end — try a hard refresh'),
    ('general', 'userUser',     290, 'That fixed it, thanks!'),
    ('general', 'zenobia',      120, 'Reminder: team retro tomorrow at 2pm'),
    ('general', 'noname',       115, 'Added to my calendar ✅'),
    ('general', 'anotherUser',  110, 'Same, see everyone then'),

    # design
    ('design', 'zenobia',       600, 'Dropping the new onboarding flow mockups here for review'),
    ('design', 'zenobia',       599, 'Main changes: simplified step 1, removed the confusing tooltip on step 3, new illustration style'),
    ('design', 'alectoxic',     580, 'The simplified step 1 is much better. Was always too much to ask upfront'),
    ('design', 'SomeUser',      575, 'Agree, love the new illustrations too. Are those from our library or custom?'),
    ('design', 'zenobia',       570, 'Custom — I made them in Figma. Happy to export the components if useful'),
    ('design', 'anotherUser',   560, 'Please do! Would love to reuse the style in the settings pages'),
    ('design', 'noname',        400, 'Quick question — for the mobile breakpoint, should the nav collapse to a bottom bar or a hamburger?'),
    ('design', 'zenobia',       390, 'Bottom bar. Our users are thumb-first, hamburgers get buried'),
    ('design', 'alectoxic',     385, '+1 on bottom bar, it also matches what we already do on the task detail view'),
    ('design', 'noname',        380, 'Makes sense, going with that'),
    ('design', 'userUser',      200, 'The dark mode contrast on the new card component looks off — text feels too light'),
    ('design', 'zenobia',       195, 'Good catch, I\'ll bump the token from gray-400 to gray-200 and re-export'),
    ('design', 'userUser',      190, 'Perfect, thanks!'),

    # marketing
    ('marketing', 'anotherUser', 700, 'Campaign brief for Q3 is ready for review: https://docs.example.com/q3-brief'),
    ('marketing', 'alectoxic',   690, 'Reading through now'),
    ('marketing', 'SomeUser',    680, 'Love the positioning angle — "built for teams that ship fast" is a strong hook'),
    ('marketing', 'anotherUser', 670, 'Thanks! Took a few iterations to land on it'),
    ('marketing', 'zenobia',     660, 'One note: the launch date says June 30 in the brief but the calendar says July 1. Which is correct?'),
    ('marketing', 'anotherUser', 655, 'Good catch — July 1 is correct, I\'ll fix the brief'),
    ('marketing', 'alectoxic',   500, 'Do we have final copy for the email sequence yet?'),
    ('marketing', 'anotherUser', 495, 'Still drafting #3 and #4. Should have them by end of week'),
    ('marketing', 'SomeUser',    490, 'Let me know if you want a second pair of eyes before sending'),
    ('marketing', 'anotherUser', 485, 'Would love that, I\'ll ping you when it\'s ready'),
    ('marketing', 'noname',      300, 'The landing page hero image is looking great 🔥'),
    ('marketing', 'zenobia',     295, 'Finally got the typography right, was driving me crazy'),
    ('marketing', 'alectoxic',   100, 'Small thing: the CTA button on mobile is getting clipped on older iPhones. Can someone take a look?'),
    ('marketing', 'SomeUser',    90,  'On it — will test on a 12 mini'),

    # engineering
    ('engineering', 'alectoxic',   800, 'PR up for the new search filters: github.com/org/repo/pull/412'),
    ('engineering', 'uuuuuuser',     790, 'Reviewing now'),
    ('engineering', 'uuuuuuser',     780, 'Left a couple of comments on the filter serializer — mostly nits, the logic looks solid'),
    ('engineering', 'alectoxic',   770, 'Addressed, take another look when you get a chance'),
    ('engineering', 'uuuuuuser',     760, 'LGTM ✅ merging'),
    ('engineering', 'noname',      700, 'Anyone know why the Celery beat task for scheduled messages isn\'t running on staging?'),
    ('engineering', 'alectoxic',   695, 'Check the redis connection — staging was migrated to a new instance last week and I\'m not sure the env var was updated'),
    ('engineering', 'noname',      690, 'That was it. Updating the env now'),
    ('engineering', 'SomeUser',    600, 'We should add a health check endpoint for Celery so this is easier to diagnose in future'),
    ('engineering', 'alectoxic',   595, 'Agreed, I\'ll add a card to the backlog'),
    ('engineering', 'uuuuuuser',     400, 'Heads up: I\'m bumping Django to 5.0 in a draft PR. Will post for review once tests pass'),
    ('engineering', 'anotherUser', 395, 'Let us know, a few of the middleware stacks might need updates'),
    ('engineering', 'uuuuuuser',     200, 'Django 5.0 PR is up: github.com/org/repo/pull/438 — all tests passing 🟢'),
    ('engineering', 'alectoxic',   195, 'Nice, will review tomorrow morning'),

    # random
    ('random', 'noname',      240, 'Who else is watching the World Cup tonight?'),
    ('random', 'zenobia',     235, 'Me! Though I\'ll be half-working 😅'),
    ('random', 'SomeUser',    230, 'Same, laptop open just in case'),
    ('random', 'anotherUser', 225, 'I gave up pretending to work during games years ago'),
    ('random', 'alectoxic',   220, '😂 the responsible move'),
    ('random', 'userUser',    180, 'Hot take: tabs > spaces'),
    ('random', 'uuuuuuser',     175, 'This is a safe space but you are wrong'),
    ('random', 'noname',      170, '4 spaces gang'),
    ('random', 'alectoxic',   165, 'We use a formatter so none of this matters and yet here we are'),
    ('random', 'zenobia',      60, 'Friday playlist is live if anyone wants some background music 🎵'),
    ('random', 'anotherUser',  55, 'Adding to my queue, thanks!'),

    # announcements
    ('announcements', 'alectoxic', 1440, 'Welcome to the new team communication platform! This replaces the old Slack workspace. All channels and DMs have been migrated.'),
    ('announcements', 'alectoxic', 1430, 'A few things to know:\n• Your notification settings carry over\n• Pinned messages are in the channel details panel\n• Use /help in any channel for a quick reference'),
    ('announcements', 'alectoxic',  720, 'We\'re rolling out the new search feature today. You can now search across all channels with filters for date, sender, file type, and more. Click the search icon in the top bar to try it.'),
    ('announcements', 'alectoxic',  360, 'Planned maintenance this Saturday 2–4am UTC. The platform will be in read-only mode during that window.'),
    ('announcements', 'alectoxic',   48, 'The maintenance is complete — everything is back to normal. Thanks for your patience 🙏'),
]


class Command(BaseCommand):
    help = 'Seed realistic chat channels and messages for development/demo'

    def add_arguments(self, parser):
        parser.add_argument('--project', type=int, default=1, help='Project ID to attach chats to (default: 1)')
        parser.add_argument('--wipe', action='store_true', help='Delete seeded channels before re-creating')

    def handle(self, *args, **options):
        project_id = options['project']
        wipe = options['wipe']

        # Load users by username
        users = {u.username: u for u in User.objects.all()}
        self.stdout.write(f'Found users: {list(users.keys())}')

        seeded_names = [c['name'] for c in CHANNELS]

        if wipe:
            deleted, _ = Chat.objects.filter(project_id=project_id, name__in=seeded_names).delete()
            self.stdout.write(self.style.WARNING(f'Wiped {deleted} existing seeded chats'))

        now = timezone.now()
        channel_map = {}  # name → Chat instance

        for ch_def in CHANNELS:
            name = ch_def['name']
            # Skip if already exists
            chat, created = Chat.objects.get_or_create(
                project_id=project_id,
                name=name,
                type='group',
                defaults={
                    'topic': ch_def.get('topic') or '',
                    'description': ch_def.get('description') or '',
                },
            )
            channel_map[name] = chat
            if created:
                self.stdout.write(f'  Created channel #{name}')
            else:
                self.stdout.write(f'  Channel #{name} already exists, skipping creation')

            # Ensure all real (non-bot, non-test) users are participants
            for username, user in users.items():
                if username in ('agent-bot', 'devuser'):
                    continue
                ChatParticipant.objects.get_or_create(
                    chat=chat,
                    user=user,
                    defaults={'is_active': True, 'is_manager': username == 'alectoxic'},
                )

        from notifications.services import create_or_update_chat_notification

        # Seed messages + notifications
        created_count = 0
        for (channel_name, sender_username, minutes_ago, content) in MESSAGES:
            chat = channel_map.get(channel_name)
            sender = users.get(sender_username)
            if not chat or not sender:
                continue

            ts = now - timedelta(minutes=minutes_ago + random.randint(0, 3))

            msg = Message.objects.create(
                chat=chat,
                sender=sender,
                content=content,
                created_at=ts,
                updated_at=ts,
            )
            created_count += 1

            # Create in-app notifications for all participants except the sender
            participants = ChatParticipant.objects.filter(
                chat=chat, is_active=True
            ).exclude(user=sender).select_related('user')

            for p in participants:
                if p.user.username == 'agent-bot':
                    continue
                try:
                    create_or_update_chat_notification(
                        recipient_id=p.user_id,
                        actor_id=sender.id,
                        chat_id=chat.id,
                        message_id=msg.id,
                        project_id=chat.project_id,
                        message_preview=content[:200],
                        actor_name=sender.username or sender.email or '',
                    )
                except Exception as e:
                    self.stdout.write(self.style.WARNING(f'  Notification skipped: {e}'))

        self.stdout.write(self.style.SUCCESS(
            f'\nDone! Created {len(CHANNELS)} channels and {created_count} messages '
            f'with notifications in project {project_id}.'
        ))
