import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockWithCourse, renderApp } from '../../test-utils';

describe('courses', () => {
  it('lists each course with its practice and toolchain, marks the one on screen, and sits between Practice and Toolchains', async () => {
    const { api } = await mockWithCourse();
    renderApp({ to: 'courses' }, api);
    const course = await screen.findByRole('listitem');
    expect(within(course).getByText('Open')).toBeInTheDocument();
    expect(course).toHaveTextContent('Code · ');
    const sidebar = within(screen.getByRole('navigation', { name: 'Main' }));
    const labels = sidebar.getAllByRole('button').map((b) => b.textContent);
    expect(labels.filter((label) => ['Learn', 'Practice', 'Courses', 'Toolchains', 'Agent'].includes(label ?? ''))).toEqual(['Learn', 'Practice', 'Courses', 'Toolchains', 'Agent']);
    expect(sidebar.getByRole('button', { name: 'Courses' })).toHaveAttribute('aria-current', 'page');
  });

  it('renames a course in place: Enter saves the new name', async () => {
    const user = userEvent.setup();
    const { api } = await mockWithCourse();
    const rename = vi.spyOn(api, 'renameCourse');
    renderApp({ to: 'courses' }, api);
    const course = await screen.findByRole('listitem');
    await user.click(within(course).getByRole('button', { name: 'Rename' }));
    const field = within(course).getByRole('textbox', { name: 'Course name' });
    await user.clear(field);
    await user.type(field, 'My React{Enter}');
    expect(rename).toHaveBeenCalledWith(expect.any(String), 'My React');
    expect(await within(course).findByText('My React')).toBeInTheDocument();
    expect(within(course).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('cancels a rename on Escape, keeping the name', async () => {
    const user = userEvent.setup();
    const { api } = await mockWithCourse();
    const rename = vi.spyOn(api, 'renameCourse');
    renderApp({ to: 'courses' }, api);
    const course = await screen.findByRole('listitem');
    const name = within(course).getByText(/./, { selector: 'b' }).textContent;
    await user.click(within(course).getByRole('button', { name: 'Rename' }));
    await user.type(within(course).getByRole('textbox', { name: 'Course name' }), 'Changed{Escape}');
    expect(rename).not.toHaveBeenCalled();
    expect(within(course).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(course).getByText(name ?? '')).toBeInTheDocument();
  });

  it('asks before deleting, with Cancel focused, and removes the course on Delete course', async () => {
    const user = userEvent.setup();
    const { api } = await mockWithCourse();
    const remove = vi.spyOn(api, 'deleteCourse');
    renderApp({ to: 'courses' }, api);
    const course = await screen.findByRole('listitem');
    await user.click(within(course).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: /^Delete ".+"\?$/ });
    expect(dialog).toHaveTextContent("This removes, and can't be undone:");
    expect(dialog).toHaveTextContent('its roadmap, lessons and exercises');
    expect(dialog).toHaveTextContent('toolchain stays installed');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(remove).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Delete course' }));
    expect(await screen.findByText('No course yet.')).toBeInTheDocument();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('says on the course\'s row when a rename or delete fails', async () => {
    const user = userEvent.setup();
    const { api } = await mockWithCourse();
    api.deleteCourse = async () => {
      throw new Error("That didn't work. Try again.");
    };
    renderApp({ to: 'courses' }, api);
    const course = await screen.findByRole('listitem');
    await user.click(within(course).getByRole('button', { name: 'Delete' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete course' }));
    expect(await within(course).findByRole('status')).toHaveTextContent("Couldn't delete the course.");
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
