# Line Dance Manager MVP Brief

Build a mobile-first teacher-only web app for a line dance instructor.

The first version is for the instructor, not students. Student self-booking is explicitly deferred to a later phase.

Core outcomes:
- The instructor can see today's classes and urgent follow-ups on a mobile dashboard.
- The instructor can manage members, their class assignments, contact details, level, notes, and active status.
- The instructor can manage recurring class groups and concrete class sessions.
- The instructor can check attendance quickly from a phone.
- The instructor can track payment records, pass type, remaining credits, due dates, unpaid members, and expiring passes.
- The app should feel usable as a real MVP even before a backend exists.

Initial technical direction:
- React + TypeScript mobile-first web app.
- Browser localStorage persistence for the MVP.
- No member login, no online card payment, no SMS/Kakao integration, and no student booking in v1.

Primary real-use scenario:
Register a member, assign them to a class, check attendance for today's class, record payment/pass information, and see the dashboard reflect today's class count plus unpaid or expiring member alerts.
