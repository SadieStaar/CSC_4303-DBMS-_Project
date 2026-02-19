CREATE DATABASE airline;
USE airline;

-- Person Table
CREATE TABLE person (
    ssn VARCHAR(11) NOT NULL,
    dob DATE NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    mid_init CHAR(1),
    last_name VARCHAR(50) NOT NULL,
    PRIMARY KEY (ssn)
);

-- Passenger Table
CREATE TABLE passenger (
    ssn VARCHAR(11) NOT NULL,
    passport_num VARCHAR(30) NOT NULL,
    email VARCHAR(254),
    phone VARCHAR(25),
    PRIMARY KEY (ssn),
    FOREIGN KEY (ssn) REFERENCES person(ssn)
);

-- Employee Table
CREATE TABLE employee (
    employee_id VARCHAR(20) NOT NULL,
    ssn VARCHAR(11) NOT NULL,
    salary DECIMAL(12,2) NOT NULL,
    PRIMARY KEY (employee_id),
    UNIQUE (ssn),
    FOREIGN KEY (ssn) REFERENCES person (ssn)
);

-- Administrator Table
CREATE TABLE administrator (
    employee_id VARCHAR(20) NOT NULL,
    PRIMARY KEY (employee_id),
    FOREIGN KEY (employee_id) REFERENCES employee(employee_id)
);

-- Flight crew table
CREATE TABLE flight_crew (
    employee_id VARCHAR(20) NOT NULL,
    admin_id VARCHAR(20),
    PRIMARY KEY (employee_id),
    FOREIGN KEY (employee_id) REFERENCES employee(employee_id),
    FOREIGN KEY (admin_id) REFERENCES administrator(employee_id)
);

-- Pilot Table
CREATE TABLE pilot (
    employee_id VARCHAR(20) NOT NULL,
    license_num VARCHAR(20) NOT NULL,
    PRIMARY KEY (employee_id),
    FOREIGN KEY (employee_id) REFERENCES flight_crew(employee_id)
);

-- Plane host table 
CREATE TABLE plane_host (
    employee_id VARCHAR(20) NOT NULL,
    PRIMARY KEY (employee_id),
    FOREIGN KEY (employee_id) REFERENCES flight_crew(employee_id)
);

-- Aircraft table
CREATE TABLE aircraft (
    tail_number VARCHAR(20) NOT NULL,
    id VARCHAR(20) NOT NULL,
    model VARCHAR(50) NOT NULL,
    capacity INT NOT NULL CHECK (capacity >= 0),
    status VARCHAR(30),
    PRIMARY KEY (tail_number)
);

-- Flight table
CREATE TABLE flight (
    flight_num VARCHAR(20) NOT NULL,
    depart_time TIMESTAMP NOT NULL,
    arrival_time TIMESTAMP NOT NULL,
    origin VARCHAR(50) NOT NULL,
    destination VARCHAR(50) NOT NULL,
    status VARCHAR(30),
    gate VARCHAR(20),
    terminal VARCHAR(20),
    tail_number VARCHAR(20) NOT NULL,
    PRIMARY KEY (flight_num),
    FOREIGN KEY (tail_number) REFERENCES aircraft(tail_number)
);

-- Ticket table 
CREATE TABLE ticket (
    ticket_num VARCHAR(20) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    seat_num VARCHAR(10) NOT NULL,
    class VARCHAR(20),
    date_booked DATE NOT NULL,
    status VARCHAR(30) NOT NULL,
    passenger_ssn VARCHAR(11) NOT NULL,
    flight_num VARCHAR(20) NOT NULL,
    PRIMARY KEY (ticket_num),
    FOREIGN KEY (passenger_ssn) REFERENCES passenger(ssn),
    FOREIGN KEY (flight_num) REFERENCES flight(flight_num)
);

-- Pilot of table (M:N)
CREATE TABLE pilot_of (
    pilot_id VARCHAR(20) NOT NULL,
    flight_num VARCHAR(20) NOT NULL,
    PRIMARY KEY (pilot_id, flight_num),
    FOREIGN KEY (pilot_id) REFERENCES pilot(employee_id),
    FOREIGN KEY (flight_num) REFERENCES flight(flight_num)
);

-- Staff of table (M:N)
CREATE TABLE staff_of (
    plane_host_id VARCHAR(20) NOT NULL,
    flight_num VARCHAR(20) NOT NULL,
    PRIMARY KEY (plane_host_id, flight_num),
    FOREIGN KEY (plane_host_id) REFERENCES plane_host(employee_id),
    FOREIGN KEY (flight_num) REFERENCES flight(flight_num)
);

-- Incident table
CREATE TABLE incident (
    incident_num VARCHAR(20) NOT NULL,
    time_occurred TIMESTAMP NOT NULL,
    description TEXT,
    tail_number VARCHAR(20) NOT NULL,
    PRIMARY KEY (incident_num),
    FOREIGN KEY (tail_number) REFERENCES aircraft(tail_number)
);